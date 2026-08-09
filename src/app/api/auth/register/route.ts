import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, signToken } from '@/lib/auth';

import { usernameSchema } from '@/lib/validation/username';

export async function POST(req: Request) {
  try {
    const { fullName, username, password } = await req.json();

    if (!fullName || !username || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const cleanUsername = username.toLowerCase().trim();

    // Validate username against Zod schema & reserved list
    const usernameValidation = usernameSchema.safeParse(cleanUsername);
    if (!usernameValidation.success) {
      return NextResponse.json(
        { error: usernameValidation.error.issues[0]?.message || 'Invalid username' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 400 });
    }

    const hashed = await hashPassword(password);

    // Create User and Profile
    const user = await prisma.user.create({
      data: {
        fullName,
        username: cleanUsername,
        passwordHash: hashed,
        profile: {
          create: {
            bio: "Hey there! I am using CupidX.",
            avatarUrl: `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${cleanUsername}`,
            themePreference: 'purple',
          },
        },
      },
    });

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
        role: user.role,
      },
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
