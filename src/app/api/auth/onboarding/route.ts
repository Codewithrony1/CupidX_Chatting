import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth, currentUser } from '@clerk/nextjs/server';
import { usernameSchema } from '@/lib/validation/username';
import { signToken } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username query parameter is required' }, { status: 400 });
    }

    const validation = usernameSchema.safeParse(username);
    if (!validation.success) {
      return NextResponse.json({
        available: false,
        reason: validation.error.issues[0]?.message || 'Invalid username format',
      });
    }

    const existing = await prisma.user.findFirst({
      where: {
        username: username.toLowerCase(),
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
    const clerkAuth = await auth();
    const clerkUser = await currentUser();

    if (!clerkAuth || !clerkAuth.userId || !clerkUser) {
      return NextResponse.json({ error: 'Unauthorized. Please authenticate with Clerk first.' }, { status: 401 });
    }

    const { username } = await req.json();

    const validation = usernameSchema.safeParse(username);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || 'Invalid username' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { clerkUserId: clerkAuth.userId },
    });

    if (existingUser) {
      return NextResponse.json({ message: 'Profile already created', user: existingUser });
    }

    // Check username uniqueness
    const usernameTaken = await prisma.user.findFirst({
      where: {
        username: username.toLowerCase(),
      },
    });

    if (usernameTaken) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
    }

    const fullName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || username;
    const avatarUrl = clerkUser.imageUrl || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${username}`;

    const newUser = await prisma.user.create({
      data: {
        clerkUserId: clerkAuth.userId,
        username: username.toLowerCase(),
        fullName,
        displayName: fullName,
        passwordHash: '',
        role: 'USER',
        profile: {
          create: {
            avatarUrl,
            bio: 'Hey there! I am using Cupidx.',
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
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Onboarding POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
