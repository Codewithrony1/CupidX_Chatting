import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getOrCreateUserFromClerk } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AuthCallbackPage() {
  const session = await auth();
  const userId = session?.userId;

  if (!userId) {
    console.log('[AUTH_CALLBACK] No session userId found -> redirecting to /login');
    redirect('/login');
  }

  // Find or provision user in database
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { clerkUserId: userId },
        { id: userId },
      ],
    },
    include: { profile: true },
  });

  if (!user) {
    try {
      user = await getOrCreateUserFromClerk(userId);
    } catch (e: any) {
      if (e?.isDeletionLocked) {
        redirect('/login?error=account_deleted_cooldown');
      }
    }
  }

  const isProfileComplete = Boolean(
    user?.profileCompleted ||
    user?.genderDobLocked ||
    user?.profile?.ageGenderConfirmed ||
    (user?.dob && user?.gender && user?.gender !== 'unspecified' && (user?.fullName || user?.displayName))
  );

  console.log('[AUTH_CALLBACK] Authoritative post-auth routing:', {
    userIdExists: Boolean(userId),
    userExistsInDb: Boolean(user),
    isProfileComplete,
    destination: isProfileComplete ? '/dashboard' : '/setup-profile',
  });

  if (isProfileComplete) {
    redirect('/dashboard');
  } else {
    redirect('/setup-profile');
  }
}
