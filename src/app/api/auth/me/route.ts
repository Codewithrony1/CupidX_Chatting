import { NextResponse } from 'next/server';
import { getCurrentUser, signToken } from '@/lib/auth';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    let user: any = await getCurrentUser(req);

    // If user is not found via cookie or clerkUserId, check Clerk details & auto-provision immediately
    if (!user) {
      try {
        const clerkAuth = await auth();
        if (clerkAuth && clerkAuth.userId) {
          // Check if DB user exists by clerkUserId
          user = await prisma.user.findUnique({
            where: { clerkUserId: clerkAuth.userId },
            include: { profile: true, subscription: true },
          });

          // If still not found, auto-provision user immediately
          if (!user) {
            let clerkUser: any = null;
            try {
              clerkUser = await currentUser();
            } catch (e) {
              console.warn('Could not fetch detailed Clerk user profile, using fallback');
            }

            const email = clerkUser?.emailAddresses?.[0]?.emailAddress || '';
            const rawName = clerkUser?.username || (email ? email.split('@')[0] : '') || `user_${clerkAuth.userId.slice(-6)}`;
            let cleanUsername = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (cleanUsername.length < 3) cleanUsername = `user_${Date.now().toString().slice(-4)}`;

            // Check if username is already in DB
            const existing = await prisma.user.findFirst({
              where: { username: cleanUsername },
            });

            const finalUsername = existing ? `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}` : cleanUsername;
            const displayName = finalUsername;

            user = await prisma.user.create({
              data: {
                clerkUserId: clerkAuth.userId,
                username: finalUsername,
                fullName: displayName,
                displayName: displayName,
                passwordHash: '',
                role: 'USER',
                membershipTier: 'FREE',
                profile: {
                  create: {
                    avatarType: 'EMOJI',
                    avatarEmoji: '😊',
                    avatarUrl: null,
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
              include: { profile: true, subscription: true },
            });
          }
        }
      } catch (e) {
        console.warn('Auto-provisioning check fallback error:', e);
      }
    }

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
          role: user.role,
          membershipTier: isVIP ? 'VIP' : 'FREE',
          profile: user.profile,
          subscription: user.subscription,
        },
      });

      // Set cookie token for 30 days so subsequent page refreshes hit fast-path
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
