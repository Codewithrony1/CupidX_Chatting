import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const userProfile = user.profile;
    const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');

    const gender = body.gender || userProfile?.gender || 'unspecified';
    const preferredGender = body.preferredGender || userProfile?.preferredGender || 'auto';
    const language = body.language || userProfile?.language || 'english';

    // Mandatory Age & Gender Gate Check
    if (!userProfile?.ageGenderConfirmed || userProfile?.gender === 'unspecified') {
      return NextResponse.json(
        {
          error: 'Mandatory Age & Gender confirmation required before joining random chat.',
          requiresConfirmation: true,
        },
        { status: 403 }
      );
    }

    // 1. Check if user already has an ACTIVE ChatSession
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

    // 2. Check if user's queue entry is already MATCHED
    const existingQueue = await prisma.matchmakingQueue.findUnique({
      where: { userId: user.id },
    });

    if (existingQueue && existingQueue.status === 'MATCHED' && existingQueue.chatSessionId) {
      const partnerUser = existingQueue.partnerUserId
        ? await prisma.user.findUnique({
            where: { id: existingQueue.partnerUserId },
            include: { profile: true },
          })
        : null;

      return NextResponse.json({
        matched: true,
        chatSessionId: existingQueue.chatSessionId,
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

    // 3. Clean up stale WAITING queue entries (>45s inactive)
    const STALE_THRESHOLD = new Date(Date.now() - 45 * 1000);
    await prisma.matchmakingQueue.updateMany({
      where: {
        status: 'WAITING',
        updatedAt: { lt: STALE_THRESHOLD },
      },
      data: { status: 'EXPIRED' },
    });

    // 4. Find compatible WAITING candidate
    // Exclude users blocked or banned by current user or vice versa
    const blockedRelations = await prisma.block.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    });
    const blockedUserIds = blockedRelations.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId));

    const bannedRelations = await prisma.userBan.findMany({
      where: { OR: [{ bannedByUserId: user.id }, { bannedUserId: user.id }] },
    });
    const bannedUserIds = bannedRelations.map((b) => (b.bannedByUserId === user.id ? b.bannedUserId : b.bannedByUserId));

    const excludeUserIds = Array.from(new Set([user.id, ...blockedUserIds, ...bannedUserIds]));

    const candidates = await prisma.matchmakingQueue.findMany({
      where: {
        status: 'WAITING',
        userId: { notIn: excludeUserIds },
        updatedAt: { gte: STALE_THRESHOLD },
      },
      orderBy: [{ joinedAt: 'asc' }],
      take: 10,
    });

    // Attempt atomic match claim with first available candidate
    for (const candidate of candidates) {
      // Check candidate isn't currently in an active session
      const candidateActiveChat = await prisma.chatSession.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [{ userAId: candidate.userId }, { userBId: candidate.userId }],
        },
      });

      if (candidateActiveChat) continue;

      const newChatSessionId = crypto.randomUUID();

      try {
        // Atomic Match Claim
        const matchResult = await prisma.$transaction(async (tx) => {
          // Double check candidate is still WAITING inside transaction
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

          if (updatedCandidate.count === 0) {
            return null; // Candidate was already matched by concurrent request
          }

          // Upsert current user queue entry to MATCHED
          await tx.matchmakingQueue.upsert({
            where: { userId: user.id },
            update: {
              status: 'MATCHED',
              chatSessionId: newChatSessionId,
              partnerUserId: candidate.userId,
              gender,
              preferredGender,
              language,
            },
            create: {
              userId: user.id,
              status: 'MATCHED',
              chatSessionId: newChatSessionId,
              partnerUserId: candidate.userId,
              gender,
              preferredGender,
              language,
            },
          });

          // Create single ChatSession
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
      } catch (err) {
        console.warn('Matchmaking transaction contention, trying next candidate:', err);
      }
    }

    // No immediate match found: Put user in WAITING queue
    await prisma.matchmakingQueue.upsert({
      where: { userId: user.id },
      update: {
        status: 'WAITING',
        chatSessionId: null,
        partnerUserId: null,
        gender,
        preferredGender,
        language,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        status: 'WAITING',
        gender,
        preferredGender,
        language,
      },
    });

    return NextResponse.json({
      matched: false,
      status: 'WAITING',
      message: 'Looking for a person to chat with you.',
    });
  } catch (error: any) {
    console.error('Matchmaking Join Error:', error);
    return NextResponse.json({ error: 'Failed to join matchmaking queue' }, { status: 500 });
  }
}
