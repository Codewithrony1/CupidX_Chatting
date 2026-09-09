import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Check user's MatchmakingQueue entry
    const userQueue = await prisma.matchmakingQueue.findUnique({
      where: { userId: user.id },
    });

    if (!userQueue) {
      return NextResponse.json({ matched: false, status: 'IDLE' });
    }

    // 2. If already MATCHED, verify active session, fetch partner details and return
    if (userQueue.status === 'MATCHED' && userQueue.chatSessionId) {
      const session = await prisma.chatSession.findUnique({
        where: { id: userQueue.chatSessionId },
      });

      if (session && session.status === 'ACTIVE') {
        const userIds = [user.id, user.clerkUserId, (user as any).firebaseUid].filter(Boolean) as string[];
        const partnerId = userIds.includes(session.userAId) ? session.userBId : session.userAId;

        const partnerUser = await prisma.user.findUnique({
          where: { id: partnerId },
          include: { profile: true },
        });

        return NextResponse.json({
          matched: true,
          chatSessionId: userQueue.chatSessionId,
          partner: partnerUser
            ? {
                id: partnerUser.id,
                displayName: partnerUser.displayName || partnerUser.fullName || 'Stranger',
                avatarUrl: partnerUser.profile?.avatarUrl || null,
                avatarEmoji: partnerUser.profile?.avatarEmoji || '😊',
                gender: partnerUser.profile?.gender || partnerUser.gender || 'unspecified',
                mood: partnerUser.profile?.mood || '',
                bio: partnerUser.profile?.bio || '',
                isVIP: partnerUser.membershipTier === 'VIP' || partnerUser.is_vip,
              }
            : null,
        });
      } else {
        // Session has ended or was terminated
        return NextResponse.json({ matched: false, status: 'ENDED' });
      }
    }

    // 3. If user is WAITING in queue: pure heartbeat & read
    if (userQueue.status === 'WAITING') {
      const now = new Date();
      // Keep updatedAt fresh so user is not pruned by stale candidate filters
      await prisma.matchmakingQueue.update({
        where: { userId: user.id },
        data: { updatedAt: now },
      });

      try {
        const { getAdminDb } = await import('@/lib/firebaseAdmin');
        const adminDb = getAdminDb();
        if (adminDb) {
          await adminDb.collection('matchmaking').doc(user.id).set(
            { updatedAt: now.getTime() },
            { merge: true }
          );
        }
      } catch (e) {
        // Firestore is non-blocking
      }

      return NextResponse.json({ matched: false, status: 'WAITING' });
    }

    return NextResponse.json({ matched: false, status: userQueue.status });
  } catch (error: any) {
    console.error('[RANDOM_CHAT_STATUS] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch matchmaking status' }, { status: 500 });
  }
}

