import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import OnboardingClient from '../onboarding/page';

export const dynamic = 'force-dynamic';

export default async function SetupProfilePage() {
  const session = await auth();
  const userId = session?.userId;

  if (!userId) {
    redirect('/login');
  }

  // Deterministic server-side profile check
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ clerkUserId: userId }, { id: userId }],
    },
    include: { profile: true },
  });

  const isProfileComplete = Boolean(
    user &&
    user.username &&
    !user.username.startsWith('user_') &&
    (user.profileCompleted ||
     user.genderDobLocked ||
     user.profile?.profileCompleted ||
     user.profile?.ageGenderConfirmed ||
     (user.dob && user.gender && user.gender !== 'unspecified' && (user.fullName || user.displayName)))
  );

  if (isProfileComplete) {
    redirect('/chat');
  }

  return <OnboardingClient />;
}
