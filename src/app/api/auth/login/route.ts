import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, signToken, getAuthCookieOptions } from '@/lib/auth';
import {
  checkAuthRateLimit,
  recordAuthAttempt,
  applyRateLimitHeaders,
  getClientIp,
} from '@/lib/rateLimit';

export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  try {
    const body = await req.json().catch(() => ({}));
    const rawIdentifier = (body.identifier || body.username || '').trim();
    const password = body.password || '';

    if (!rawIdentifier || !password) {
      const errRes = NextResponse.json({ error: 'Please enter your username or email and password' }, { status: 400 });
      return applyRateLimitHeaders(errRes, checkAuthRateLimit(clientIp));
    }

    const cleanIdentifier = rawIdentifier.toLowerCase();

    // Dual-tier rate limiting: IP throttle (10 req/min) + Account lockout (5 failed attempts/15 mins)
    const limitCheck = checkAuthRateLimit(clientIp, cleanIdentifier);
    if (limitCheck.isBlocked) {
      const blockedRes = NextResponse.json(
        {
          error: `Too many login attempts. Please try again in ${limitCheck.retryAfterSeconds} seconds.`,
          retryAfter: limitCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
      return applyRateLimitHeaders(blockedRes, limitCheck);
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanIdentifier },
          { email: cleanIdentifier },
        ],
      },
      include: { profile: true, subscription: true },
    });

    if (!user) {
      recordAuthAttempt(clientIp, cleanIdentifier, true);
      const postLimit = checkAuthRateLimit(clientIp, cleanIdentifier);
      const errRes = NextResponse.json({ error: 'Invalid username/email or password' }, { status: 401 });
      return applyRateLimitHeaders(errRes, postLimit);
    }

    if (user.isSuspended) {
      const suspendedRes = NextResponse.json(
        { error: 'Your account has been suspended. Please contact support.' },
        { status: 403 }
      );
      return applyRateLimitHeaders(suspendedRes, limitCheck);
    }

    if (!user.passwordHash) {
      const oauthRes = NextResponse.json(
        { error: 'This account was created with Google. Please click Continue with Google.' },
        { status: 400 }
      );
      return applyRateLimitHeaders(oauthRes, limitCheck);
    }

    const match = await comparePassword(password, user.passwordHash);
    if (!match) {
      recordAuthAttempt(clientIp, cleanIdentifier, true);
      const postLimit = checkAuthRateLimit(clientIp, cleanIdentifier);
      const errRes = NextResponse.json({ error: 'Invalid username/email or password' }, { status: 401 });
      return applyRateLimitHeaders(errRes, postLimit);
    }

    // Success! Record successful auth (clears account lock)
    recordAuthAttempt(clientIp, cleanIdentifier, false);

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      message: 'Logged in successfully',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profile: user.profile,
        subscription: user.subscription,
      },
    });

    response.cookies.set('token', token, getAuthCookieOptions(req));

    const postLimit = checkAuthRateLimit(clientIp, cleanIdentifier);
    return applyRateLimitHeaders(response, postLimit);
  } catch (error: any) {
    console.error('[AUTH:LOGIN_ERROR]:', error?.message || error);
    const isDbError = error?.code?.startsWith('P') || error?.message?.includes('database') || error?.message?.includes('connection');
    const userMessage = isDbError
      ? 'Database service is connecting. Please retry in a few seconds.'
      : 'Login failed. Please check your credentials and try again.';
    const errRes = NextResponse.json({ error: userMessage }, { status: 500 });
    return applyRateLimitHeaders(errRes, checkAuthRateLimit(clientIp));
  }
}
