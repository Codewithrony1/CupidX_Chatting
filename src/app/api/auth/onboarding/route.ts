import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, currentUser } from '@clerk/nextjs/server';
import { usernameSchema } from '@/lib/validation/username';
import { signToken, getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username query parameter is required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');

    const validation = usernameSchema.safeParse(cleanUsername);
    if (!validation.success) {
      return NextResponse.json({
        available: false,
        reason: validation.error.issues[0]?.message || 'Invalid username format',
      });
    }

    const existing = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
      },
    });

    if (existing) {
      return NextResponse.json({ available: false, reason: 'Username is already taken' });
    }

    return NextResponse.json({ available: true });
  } catch (error) {
    console.error('Check username error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, displayName: inputDisplayName, avatarEmoji: inputAvatarEmoji, age: inputAge, gender: inputGender } = body;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    const cleanDisplayName = (inputDisplayName || '').trim() || cleanUsername;
    const selectedEmoji = inputAvatarEmoji || '😊';
    const parsedAge = inputAge ? Math.min(99, Math.max(18, parseInt(inputAge.toString(), 10))) : 18;
    const cleanGender = inputGender ? inputGender.toString().trim().toLowerCase() : 'unspecified';

    const validation = usernameSchema.safeParse(cleanUsername);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || 'Invalid username format' },
        { status: 400 }
      );
    }

    let clerkUserId: string | null = null;

    try {
      const clerkAuth = await auth();
      if (clerkAuth && clerkAuth.userId) {
        clerkUserId = clerkAuth.userId;
      }
    } catch (e) {
      console.warn('Clerk auth check fallback:', e);
    }

    const existingCookieUser = await getCurrentUser(req);

    if (!clerkUserId && !existingCookieUser) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    // 1. Check if user already exists by Clerk ID or DB ID
    let user = null;
    if (clerkUserId) {
      user = await prisma.user.findUnique({
        where: { clerkUserId },
        include: { profile: true, subscription: true },
      });
    } else if (existingCookieUser) {
      user = existingCookieUser;
    }

    if (user) {
      if (user.username !== cleanUsername) {
        const taken = await prisma.user.findFirst({
          where: { username: cleanUsername, id: { not: user.id } },
        });

        if (taken) {
          return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
        }
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: cleanUsername,
          displayName: cleanDisplayName,
          fullName: cleanDisplayName,
          profile: {
            update: {
              avatarType: 'EMOJI',
              avatarEmoji: selectedEmoji,
              age: parsedAge,
              gender: cleanGender,
              ageGenderConfirmed: true,
            },
          },
        },
        include: { profile: true, subscription: true },
      });

      const token = signToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      const response = NextResponse.json({ success: true, user });
      response.cookies.set('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60,
        path: '/',
      });
      return response;
    }

    // 2. Check if username is taken by anyone
    const usernameTaken = await prisma.user.findFirst({
      where: { username: cleanUsername },
    });

    if (usernameTaken) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
    }

    // 3. Create new user in database
    const newUser = await prisma.user.create({
      data: {
        clerkUserId: clerkUserId || null,
        username: cleanUsername,
        fullName: cleanDisplayName,
        displayName: cleanDisplayName,
        passwordHash: '',
        role: 'USER',
        profile: {
          create: {
            avatarType: 'EMOJI',
            avatarEmoji: selectedEmoji,
            avatarUrl: null,
            age: parsedAge,
            gender: cleanGender,
            ageGenderConfirmed: true,
            bio: 'Hey there! I am using Cupidx.',
          },
        },
        subscription: {
          create: {
            plan: 'FREE',
            isActive: false,
            subscriptionStatus: 'INACTIVE',
          },
        },
      },
      include: {
        profile: true,
        subscription: true,
      },
    });

    const token = signToken({
      userId: newUser.id,
      username: newUser.username,
      role: newUser.role,
    });

    const response = NextResponse.json({ success: true, user: newUser });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Onboarding POST error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
