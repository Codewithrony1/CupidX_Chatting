import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (user) {
      return NextResponse.json({
        user: {
          id: user.id,
          clerkUserId: user.clerkUserId,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          profile: user.profile,
          subscription: user.subscription,
        },
      });
    }

    // Check if Clerk user is signed in but needs Cupidx onboarding
    try {
      const clerkAuth = await auth();
      if (clerkAuth && clerkAuth.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { clerkUserId: clerkAuth.userId },
        });

        if (!dbUser) {
          return NextResponse.json({ needsOnboarding: true }, { status: 200 });
        }
      }
    } catch (e) {
      // Clerk auth fallback
    }

    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
