import { NextResponse } from 'next/server';
import { getCurrentUser, signToken } from '@/lib/auth';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    let user: any = await getCurrentUser(req);

    // If user is not found via cookie or clerkUserId, check Clerk details & auto-provision if possible
    if (!user) {
      try {
        const clerkAuth = await auth();
        if (clerkAuth && clerkAuth.userId) {
          // Check if DB user exists by clerkUserId
          user = await prisma.user.findUnique({
            where: { clerkUserId: clerkAuth.userId },
            include: { profile: true, subscription: true },
          });

          // If still not found, try fetching Clerk user profile details to auto-provision
          if (!user) {
            const clerkUser = await currentUser();
            if (clerkUser) {
              const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
              const clerkUsername = clerkUser.username || (email ? email.split('@')[0] : '');

              if (clerkUsername) {
                let cleanUsername = clerkUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
                if (cleanUsername.length < 3) cleanUsername = `user_${Date.now().toString().slice(-4)}`;

                // Check if username is already in DB
                const existing = await prisma.user.findFirst({
                  where: { username: cleanUsername },
                });

                const finalUsername = existing ? `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}` : cleanUsername;

                user = await prisma.user.create({
                  data: {
                    clerkUserId: clerkAuth.userId,
                    username: finalUsername,
                    fullName: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || finalUsername,
                    profile: {
                      create: {
                        avatarUrl: clerkUser.imageUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=CupidXUser',
                      },
                    },
                    subscription: {
                      create: {
                        plan: 'FREE',
                        isActive: true,
                      },
                    },
                  },
                  include: { profile: true, subscription: true },
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('Auto-provisioning check fallback:', e);
      }
    }

    if (user) {
      const isVIP = user.subscription?.isActive || user.membershipTier === 'VIP';
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

    // Only ask for onboarding if NO user exists and no Clerk profile details were found
    return NextResponse.json({ needsOnboarding: true }, { status: 200 });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
