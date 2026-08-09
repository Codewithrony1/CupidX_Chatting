import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, signToken } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
    }

    const cleanUsername = username.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { username: cleanUsername },
      include: { profile: true, subscription: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    }

    if (user.isSuspended) {
      return NextResponse.json({ error: 'Your account has been suspended' }, { status: 403 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: 'Please sign in using Clerk authentication' }, { status: 400 });
    }

    const match = await comparePassword(password, user.passwordHash);
    if (!match) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 });
    }

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
        role: user.role,
        profile: user.profile,
        subscription: user.subscription,
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
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
