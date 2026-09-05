import { NextResponse } from 'next/server';
import { getCurrentUser, signToken } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user: any = await getCurrentUser(req);

    if (user) {
      const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');
      const token = signToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      const response = NextResponse.json({
        user: {
          id: user.id,
          clerkUserId: user.clerkUserId,
          username: user.username,
          fullName: user.fullName,
          displayName: user.displayName || user.fullName,
          email: user.email,
          role: user.role,
          membershipTier: isVIP ? 'VIP' : 'FREE',
          is_vip: isVIP,
          profile: user.profile,
          subscription: user.subscription,
        },
      });

      response.cookies.set('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
