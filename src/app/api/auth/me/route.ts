import { NextResponse } from 'next/server';
import { getCurrentUser, signToken } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user: any = await getCurrentUser(req);

    if (user) {
      const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');
      const isProfileDone = Boolean(
        user.profileCompleted ||
        user.profileLocked ||
        user.genderDobLocked ||
        user.profile?.profileCompleted ||
        user.profile?.ageGenderConfirmed ||
        (user.dob && user.gender && user.gender !== 'unspecified' && user.fullName)
      );

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
          vipUsername: user.vipUsername || null,
          vipUsernameClaimedAt: user.vipUsernameClaimedAt || null,
          fullName: user.fullName,
          displayName: user.displayName || user.fullName,
          email: user.email,
          gender: user.gender || user.profile?.gender || 'unspecified',
          dob: user.dob ? new Date(user.dob).toISOString().slice(0, 10) : (user.profile?.dob ? new Date(user.profile.dob).toISOString().slice(0, 10) : null),
          genderDobLocked: Boolean(user.genderDobLocked || user.profile?.ageGenderConfirmed),
          role: user.role,
          membershipTier: isVIP ? 'VIP' : 'FREE',
          is_vip: isVIP,
          profileCompleted: isProfileDone,
          profileLocked: isProfileDone,
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
