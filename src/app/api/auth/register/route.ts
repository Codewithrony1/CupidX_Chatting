import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, signToken, getAuthCookieOptions } from '@/lib/auth';
import { usernameSchema } from '@/lib/validation/username';
import {
  checkAuthRateLimit,
  recordAuthAttempt,
  applyRateLimitHeaders,
  getClientIp,
} from '@/lib/rateLimit';

export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  try {
    // Check IP rate limit for registration attempts (max 10 requests / 60s)
    const limitCheck = checkAuthRateLimit(clientIp);
    if (limitCheck.isBlocked) {
      const blockedRes = NextResponse.json(
        {
          error: `Too many registration attempts. Please try again in ${limitCheck.retryAfterSeconds} seconds.`,
          retryAfter: limitCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
      return applyRateLimitHeaders(blockedRes, limitCheck);
    }

    const body = await req.json().catch(() => ({}));
    const fullName = (body.fullName || '').trim();
    const rawUsername = (body.username || '').trim();
    const rawEmail = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!fullName || !rawUsername || !password) {
      const errRes = NextResponse.json({ error: 'Please fill in all required fields' }, { status: 400 });
      return applyRateLimitHeaders(errRes, limitCheck);
    }

    let cleanUsername = rawUsername.toLowerCase().trim();
    let cleanEmail = rawEmail;

    if (cleanUsername.includes('@')) {
      if (!cleanEmail) cleanEmail = cleanUsername;
      cleanUsername = cleanUsername.split('@')[0].replace(/[^a-z0-9_]/g, '');
    }

    if (cleanUsername.length < 3) {
      cleanUsername = `${cleanUsername || 'user'}_${Math.random().toString(36).substring(2, 6)}`;
    }

    // Validate username against Zod schema & reserved list
    const usernameValidation = usernameSchema.safeParse(cleanUsername);
    if (!usernameValidation.success) {
      const errRes = NextResponse.json(
        { error: usernameValidation.error.issues[0]?.message || 'Username can only contain letters, numbers, and underscores (3-20 chars).' },
        { status: 400 }
      );
      return applyRateLimitHeaders(errRes, limitCheck);
    }

    if (password.length < 6) {
      const errRes = NextResponse.json({ error: 'Password must be at least 6 characters long' }, { status: 400 });
      return applyRateLimitHeaders(errRes, limitCheck);
    }

    // Check duplicate email if email provided
    if (cleanEmail) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: cleanEmail },
      });
      if (existingEmail) {
        recordAuthAttempt(clientIp, cleanUsername, true);
        const postLimit = checkAuthRateLimit(clientIp);
        const errRes = NextResponse.json({ error: 'An account with this email already exists. Please log in.' }, { status: 400 });
        return applyRateLimitHeaders(errRes, postLimit);
      }
    }

    // Check if username exists
    const existingUser = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existingUser) {
      recordAuthAttempt(clientIp, cleanUsername, true);
      const postLimit = checkAuthRateLimit(clientIp);
      const errRes = NextResponse.json({ error: 'This username is already taken. Please choose another.' }, { status: 400 });
      return applyRateLimitHeaders(errRes, postLimit);
    }

    const hashed = await hashPassword(password);

    // Create User and Profile
    const user = await prisma.user.create({
      data: {
        fullName,
        username: cleanUsername,
        email: cleanEmail || null,
        passwordHash: hashed,
        profile: {
          create: {
            bio: "Hey there! I am using CupidX.",
            avatarUrl: null,
            avatarType: 'EMOJI',
            avatarEmoji: '😊',
            themePreference: 'purple',
          },
        },
      },
    });

    recordAuthAttempt(clientIp, cleanUsername, false);

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      message: 'Registered successfully',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set('token', token, getAuthCookieOptions(req));

    const postLimit = checkAuthRateLimit(clientIp);
    return applyRateLimitHeaders(response, postLimit);
  } catch (error: any) {
    console.error('[AUTH:REGISTER_ERROR]:', error?.message || error);
    const isDbError = error?.code?.startsWith('P') || error?.message?.includes('database') || error?.message?.includes('connection');
    const userMessage = isDbError
      ? 'Database service is connecting. Please retry in a few seconds.'
      : 'Registration failed. Please check your information and try again.';
    const errRes = NextResponse.json({ error: userMessage }, { status: 500 });
    return applyRateLimitHeaders(errRes, checkAuthRateLimit(clientIp));
  }
}
