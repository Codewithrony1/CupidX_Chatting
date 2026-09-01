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
                username: partnerUser.username,
                fullName: partnerUser.fullName,
                displayName: partnerUser.displayName || partnerUser.fullName,
                avatarUrl: partnerUser.profile?.avatarUrl || null,
                avatarEmoji: partnerUser.profile?.avatarEmoji || '😊',
                gender: partnerUser.profile?.gender || partnerUser.gender || 'unspecified',
                isVIP: partnerUser.membershipTier === 'VIP' || partnerUser.is_vip,
              }
            : null,
        });
      }
    }

    // 3. If user is WAITING in queue:
    if (userQueue.status === 'WAITING') {
      // Send Heartbeat (keep updatedAt fresh)
      await prisma.matchmakingQueue.update({
        where: { userId: user.id },
        data: { updatedAt: new Date() },
      });

      // Check if there is another WAITING candidate online right now
      const STALE_THRESHOLD = new Date(Date.now() - 60 * 1000);
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

            return NextResponse.json({
              matched: true,
              chatSessionId: newChatSessionId,
              partner: partnerUser
                ? {
                    id: partnerUser.id,
                    username: partnerUser.username,
                    fullName: partnerUser.fullName,
                    displayName: partnerUser.displayName || partnerUser.fullName,
                    avatarUrl: partnerUser.profile?.avatarUrl || null,
                    avatarEmoji: partnerUser.profile?.avatarEmoji || '😊',
                    gender: partnerUser.profile?.gender || partnerUser.gender || 'unspecified',
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
