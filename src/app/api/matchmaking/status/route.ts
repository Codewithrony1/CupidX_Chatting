import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

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

    // 2. If already MATCHED, fetch partner details and return
    if (userQueue.status === 'MATCHED' && userQueue.chatSessionId) {
      // Ensure chat session is still active
      const session = await prisma.chatSession.findUnique({
        where: { id: userQueue.chatSessionId },
      });

      if (session && session.status === 'ACTIVE') {
        const partnerId = session.userAId === user.id ? session.userBId : session.userAId;
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
      }
    }

    // 3. If user is WAITING in queue:
    if (userQueue.status === 'WAITING') {
      const now = new Date();
      // Send Heartbeat (keep updatedAt fresh)
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
      } catch (e) {}

      // Check if there is another WAITING candidate online right now
      const STALE_THRESHOLD = new Date(Date.now() - 25 * 1000);
      const blockedRelations = await prisma.block.findMany({
        where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      });
      const blockedUserIds = blockedRelations.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId));

      const candidate = await prisma.matchmakingQueue.findFirst({
        where: {
          status: 'WAITING',
          userId: { notIn: [user.id, ...blockedUserIds] },
          updatedAt: { gte: STALE_THRESHOLD },
        },
        orderBy: [{ joinedAt: 'asc' }],
      });

      if (candidate) {
        const newChatSessionId = crypto.randomUUID();

        try {
          const matchResult = await prisma.$transaction(async (tx) => {
            const updatedCandidate = await tx.matchmakingQueue.updateMany({
              where: {
                userId: candidate.userId,
                status: 'WAITING',
              },
              data: {
                status: 'MATCHED',
                chatSessionId: newChatSessionId,
                partnerUserId: user.id,
                updatedAt: new Date(),
              },
            });

            if (updatedCandidate.count === 0) return null;

            await tx.matchmakingQueue.update({
              where: { userId: user.id },
              data: {
                status: 'MATCHED',
                chatSessionId: newChatSessionId,
                partnerUserId: candidate.userId,
                updatedAt: new Date(),
              },
            });

            const session = await tx.chatSession.create({
              data: {
                id: newChatSessionId,
                userAId: user.id,
                userBId: candidate.userId,
                status: 'ACTIVE',
              },
            });

            return session;
          });

          if (matchResult) {
            const partnerUser = await prisma.user.findUnique({
              where: { id: candidate.userId },
              include: { profile: true },
            });

            // Mirror match to Firestore
            try {
              const { getAdminDb } = await import('@/lib/firebaseAdmin');
              const adminDb = getAdminDb();
              if (adminDb) {
                const matchNow = Date.now();
                await adminDb.collection('matches').doc(newChatSessionId).set({
                  matchId: newChatSessionId,
                  user1Uid: user.id,
                  user2Uid: candidate.userId,
                  user1DisplayName: user.displayName || user.fullName || 'Stranger',
                  user2DisplayName: partnerUser?.displayName || partnerUser?.fullName || 'Stranger',
                  user1AvatarUrl: user.profile?.avatarUrl || null,
                  user2AvatarUrl: partnerUser?.profile?.avatarUrl || null,
                  user1AvatarEmoji: user.profile?.avatarEmoji || '😊',
                  user2AvatarEmoji: partnerUser?.profile?.avatarEmoji || '😊',
                  user1Gender: user.profile?.gender || user.gender || 'unspecified',
                  user2Gender: partnerUser?.profile?.gender || partnerUser?.gender || 'unspecified',
                  user1IsVIP: Boolean(user.membershipTier === 'VIP' || user.is_vip),
                  user2IsVIP: Boolean(partnerUser?.membershipTier === 'VIP' || partnerUser?.is_vip),
                  status: 'active',
                  createdAt: matchNow,
                });

                await adminDb.collection('matchmaking').doc(candidate.userId).set(
                  {
                    status: 'matched',
                    matchId: newChatSessionId,
                    partnerUid: user.id,
                    matchedAt: matchNow,
                    updatedAt: matchNow,
                  },
                  { merge: true }
                );

                await adminDb.collection('matchmaking').doc(user.id).set(
                  {
                    status: 'matched',
                    matchId: newChatSessionId,
                    partnerUid: candidate.userId,
                    matchedAt: matchNow,
                    updatedAt: matchNow,
                  },
                  { merge: true }
                );
              }
            } catch (e) {
              console.warn('Status route firestore sync error:', e);
            }

            return NextResponse.json({
              matched: true,
              chatSessionId: newChatSessionId,
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
          }
        } catch (e) {
          console.warn('Matchmaking poll transaction collision:', e);
        }
      }

      return NextResponse.json({ matched: false, status: 'WAITING' });
    }

    return NextResponse.json({ matched: false, status: userQueue.status });
  } catch (error: any) {
    console.error('Matchmaking Status Error:', error);
    return NextResponse.json({ error: 'Failed to fetch matchmaking status' }, { status: 500 });
  }
}
