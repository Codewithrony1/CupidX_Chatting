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

    // 1. Check if user has an active ChatSession
    const activeChat = await prisma.chatSession.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      include: {
        userA: { include: { profile: true } },
        userB: { include: { profile: true } },
      },
    });

    if (activeChat) {
      const partner = activeChat.userAId === user.id ? activeChat.userB : activeChat.userA;
      return NextResponse.json({
        matched: true,
        chatSessionId: activeChat.id,
        partner: {
          id: partner.id,
          username: partner.username,
          fullName: partner.fullName,
          avatarUrl: partner.profile?.avatarUrl || '/default-avatar.png',
          gender: partner.profile?.gender || 'unspecified',
          isVIP: partner.membershipTier === 'VIP',
        },
      });
    }

    // 2. Check user's MatchmakingQueue entry
    const userQueue = await prisma.matchmakingQueue.findUnique({
      where: { userId: user.id },
    });

    if (!userQueue) {
      return NextResponse.json({ matched: false, status: 'IDLE' });
    }

    if (userQueue.status === 'MATCHED' && userQueue.chatSessionId) {
      const partnerUser = userQueue.partnerUserId
        ? await prisma.user.findUnique({
            where: { id: userQueue.partnerUserId },
            include: { profile: true },
          })
        : null;

      return NextResponse.json({
        matched: true,
        chatSessionId: userQueue.chatSessionId,
        partner: partnerUser
          ? {
              id: partnerUser.id,
              username: partnerUser.username,
              fullName: partnerUser.fullName,
              avatarUrl: partnerUser.profile?.avatarUrl || '/default-avatar.png',
              gender: partnerUser.profile?.gender || 'unspecified',
              isVIP: partnerUser.membershipTier === 'VIP',
            }
          : null,
      });
    }

    if (userQueue.status === 'WAITING') {
      // Send Heartbeat: update updatedAt so user isn't marked as stale
      await prisma.matchmakingQueue.update({
        where: { userId: user.id },
        data: { updatedAt: new Date() },
      });

      // Try atomic match check during poll
      const STALE_THRESHOLD = new Date(Date.now() - 45 * 1000);
      const candidates = await prisma.matchmakingQueue.findMany({
        where: {
          status: 'WAITING',
          userId: { not: user.id },
          updatedAt: { gte: STALE_THRESHOLD },
        },
        orderBy: [{ isVIP: 'desc' }, { joinedAt: 'asc' }],
        take: 5,
      });

      for (const candidate of candidates) {
        const candidateActiveChat = await prisma.chatSession.findFirst({
          where: {
            status: 'ACTIVE',
            OR: [{ userAId: candidate.userId }, { userBId: candidate.userId }],
          },
        });

        if (candidateActiveChat) continue;

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
              },
            });

            if (updatedCandidate.count === 0) return null;

            await tx.matchmakingQueue.update({
              where: { userId: user.id },
              data: {
                status: 'MATCHED',
                chatSessionId: newChatSessionId,
                partnerUserId: candidate.userId,
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
                    avatarUrl: partnerUser.profile?.avatarUrl || '/default-avatar.png',
                    gender: partnerUser.profile?.gender || 'unspecified',
                    isVIP: partnerUser.membershipTier === 'VIP',
                  }
                : null,
            });
          }
        } catch (e) {
          // Contention, continue polling
        }
      }

      return NextResponse.json({ matched: false, status: 'WAITING' });
    }

    return NextResponse.json({ matched: false, status: userQueue.status });
  } catch (error: any) {
    console.error('Matchmaking Status Error:', error);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
