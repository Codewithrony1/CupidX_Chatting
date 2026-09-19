import { NextResponse } from 'next/server';
import { getCurrentUser, signToken, getAuthCookieOptions } from '@/lib/auth';
import { isUserVip } from '@/lib/vipAuth';

export async function GET(req: Request) {
  try {
    let user: any = await getCurrentUser(req);
    if (!user) {
      try {
        const { auth: clerkAuth } = await import('@clerk/nextjs/server');
        const clerkSession = await clerkAuth();
        if (clerkSession?.userId) {
          const { getOrCreateUserFromClerk } = await import('@/lib/auth');
          try {
            user = await getOrCreateUserFromClerk(clerkSession.userId);
          } catch (clerkErr: any) {
            if (clerkErr?.isDeletionLocked) {
              return NextResponse.json(
                {
                  error:
                    'Your previous account was recently deleted. For security reasons, you can create a new CupidxChat account after the temporary 48-hour restriction expires.',
                  isDeletionLocked: true,
                  expiresAt: clerkErr.expiresAt,
                  remainingHours: clerkErr.remainingHours,
                },
                { status: 403 }
              );
            }
            throw clerkErr;
          }
        }
      } catch (e: any) {
        if (e?.isDeletionLocked) {
          return NextResponse.json(
            {
              error:
                'Your previous account was recently deleted. For security reasons, you can create a new CupidxChat account after the temporary 48-hour restriction expires.',
              isDeletionLocked: true,
              expiresAt: e.expiresAt,
              remainingHours: e.remainingHours,
            },
            { status: 403 }
          );
        }
      }
    }

    if (user) {
      const isVIP = isUserVip(user);
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
          vip_started_at: user.vip_started_at || user.subscription?.startDate || null,
          vip_expires_at: user.vip_expires_at || user.subscription?.endDate || null,
          profileCompleted: isProfileDone,
          profileLocked: isProfileDone,
          profile: user.profile,
          subscription: user.subscription,
        },
      });

      response.cookies.set('token', token, getAuthCookieOptions(req, 30 * 24 * 60 * 60));

      return response;
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
