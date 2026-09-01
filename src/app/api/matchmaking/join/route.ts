import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const userProfile = user.profile;
    const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');

    const gender = body.gender || userProfile?.gender || user.gender || 'unspecified';
    const preferredGender = body.preferredGender || userProfile?.preferredGender || 'auto';
    const language = body.language || userProfile?.language || 'english';

    // 1. Clean up / end any prior ACTIVE chat sessions for this user so they get fresh matches
    await prisma.chatSession.updateMany({
      where: {
        status: 'ACTIVE',
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      data: { status: 'ENDED' },
    });

    // 2. Clean up stale WAITING queue entries (>60s inactive)
    const STALE_THRESHOLD = new Date(Date.now() - 60 * 1000);
    await prisma.matchmakingQueue.updateMany({
      where: {
        status: 'WAITING',
        updatedAt: { lt: STALE_THRESHOLD },
      },
      data: { status: 'EXPIRED' },
    });

    // 3. Find list of blocked or banned user IDs
    const blockedRelations = await prisma.block.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    });
    const blockedUserIds = blockedRelations.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId));

    const bannedRelations = await prisma.userBan.findMany({
      where: { OR: [{ bannedByUserId: user.id }, { bannedUserId: user.id }] },
    });
    const bannedUserIds = bannedRelations.map((b) => (b.bannedByUserId === user.id ? b.bannedUserId : b.bannedByUserId));

    const excludeUserIds = Array.from(new Set([user.id, ...blockedUserIds, ...bannedUserIds]));

    // 4. Find all active WAITING candidates currently on the website
    const candidates = await prisma.matchmakingQueue.findMany({
      where: {
        status: 'WAITING',
        userId: { notIn: excludeUserIds },
        updatedAt: { gte: STALE_THRESHOLD },
      },
      orderBy: [{ joinedAt: 'asc' }],
      take: 10,
    });

    // 5. Try to match with the earliest waiting candidate
    for (const candidate of candidates) {
      const newChatSessionId = crypto.randomUUID();

      try {
        const matchResult = await prisma.$transaction(async (tx) => {
          // Verify candidate is still WAITING inside transaction
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

          if (updatedCandidate.count === 0) {
            return null; // Candidate was already taken by someone else
          }

          // Mark current user as MATCHED
          await tx.matchmakingQueue.upsert({
            where: { userId: user.id },
            update: {
              status: 'MATCHED',
              chatSessionId: newChatSessionId,
              partnerUserId: candidate.userId,
              gender,
              preferredGender,
              language,
              updatedAt: new Date(),
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

          // Create active ChatSession
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
      } catch (err) {
        console.warn('Matchmaking contention, checking next candidate:', err);
      }
    }

    // 6. No immediate candidate available: Put user into WAITING queue
    await prisma.matchmakingQueue.upsert({
      where: { userId: user.id },
      update: {
        status: 'WAITING',
        chatSessionId: null,
        partnerUserId: null,
        gender,
        preferredGender,
        language,
        joinedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        status: 'WAITING',
        gender,
        preferredGender,
        language,
        joinedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      matched: false,
      status: 'WAITING',
      message: 'Looking for a person to chat with you...',
    });
  } catch (error: any) {
    console.error('Matchmaking Join Error:', error);
    return NextResponse.json({ error: 'Failed to join matchmaking queue' }, { status: 500 });
  }
}
