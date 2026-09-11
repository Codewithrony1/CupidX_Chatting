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
    const { skipCurrentMatch = false, excludePartnerId = null } = body;
    const userProfile = user.profile;
    const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');

    const gender = body.gender || userProfile?.gender || user.gender || 'unspecified';
    const preferredGender = body.preferredGender || userProfile?.preferredGender || 'auto';
    const language = body.language || userProfile?.language || 'english';

    // 1. Check if user already belongs to an active match (Requirement 6: ONE USER = ONE ACTIVE MATCH)
    const userIds = [user.id, user.clerkUserId, (user as any).firebaseUid].filter(Boolean) as string[];

    if (!skipCurrentMatch) {
      const existingSession = await prisma.chatSession.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }],
        },
        include: {
          userA: { include: { profile: true } },
          userB: { include: { profile: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (existingSession) {
        const isUserA = userIds.includes(existingSession.userAId);
        const partner = isUserA ? existingSession.userB : existingSession.userA;

        // Verify session freshness: created or has message within last 10 minutes
        const lastActivity = existingSession.messages[0]?.createdAt || existingSession.startedAt;
        const isFresh = Date.now() - new Date(lastActivity).getTime() < 10 * 60 * 1000;

        if (isFresh) {
          return NextResponse.json({
            matched: true,
            chatSessionId: existingSession.id,
            partner: {
              id: partner.id,
              displayName: partner.displayName || partner.fullName || 'Stranger',
              avatarUrl: partner.profile?.avatarUrl || null,
              avatarEmoji: partner.profile?.avatarEmoji || '😊',
              gender: partner.profile?.gender || partner.gender || 'unspecified',
              mood: partner.profile?.mood || '',
              bio: partner.profile?.bio || '',
              isVIP: partner.membershipTier === 'VIP' || partner.is_vip,
            },
          });
        } else {
          // Check Firestore before marking as ended
          let isActiveInCloud = false;
          try {
            const { getAdminDb } = await import('@/lib/firebaseAdmin');
            const adminDb = getAdminDb();
            if (adminDb) {
              const snap = await adminDb.collection('matches').doc(existingSession.id).get();
              if (snap.exists && snap.data()?.status === 'active') {
                isActiveInCloud = true;
              }
            }
          } catch (e) {}

          if (isActiveInCloud) {
            return NextResponse.json({
              matched: true,
              chatSessionId: existingSession.id,
              partner: {
                id: partner.id,
                displayName: partner.displayName || partner.fullName || 'Stranger',
                avatarUrl: partner.profile?.avatarUrl || null,
                avatarEmoji: partner.profile?.avatarEmoji || '😊',
                gender: partner.profile?.gender || partner.gender || 'unspecified',
                mood: partner.profile?.mood || '',
                bio: partner.profile?.bio || '',
                isVIP: partner.membershipTier === 'VIP' || partner.is_vip,
              },
            });
          } else {
            // Only truly stale / abandoned sessions (>10m with no messages and not active in cloud) are cleaned up
            await prisma.chatSession.update({
              where: { id: existingSession.id },
              data: { status: 'ENDED', endedAt: new Date() },
            });
          }
        }
      }
    }

    // 2. Check if Random Chat is enabled globally before allowing new entrants
    const chatSetting = await prisma.appSetting.findUnique({
      where: { key: 'randomChatEnabled' },
    });
    const randomChatEnabled = chatSetting ? chatSetting.value !== 'false' : true;
    if (!randomChatEnabled) {
      return NextResponse.json(
        {
          error: 'Random Chat is currently unavailable. Please try again later.',
          disabled: true,
        },
        { status: 503 }
      );
    }

    if (skipCurrentMatch) {
      // User explicitly skipped / requested next match: terminate prior active sessions
      const oldSessions = await prisma.chatSession.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }],
        },
      });

      for (const s of oldSessions) {
        try {
          const { getAdminDb } = await import('@/lib/firebaseAdmin');
          const adminDb = getAdminDb();
          if (adminDb) {
            await adminDb.collection('matches').doc(s.id).set(
              { status: 'ended', endedAt: Date.now(), endedBy: user.id },
              { merge: true }
            );
          }
        } catch (e) {}
      }

      await prisma.chatSession.updateMany({
        where: {
          status: 'ACTIVE',
          OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }],
        },
        data: { status: 'ENDED', endedAt: new Date() },
      });
    }

    // 2. Clean up stale WAITING queue entries (>25s inactive)
    const STALE_THRESHOLD = new Date(Date.now() - 25 * 1000);
    await prisma.matchmakingQueue.updateMany({
      where: {
        status: 'WAITING',
        updatedAt: { lt: STALE_THRESHOLD },
      },
      data: { status: 'EXPIRED' },
    });

    // 3. Find list of blocked or banned user IDs + excludePartnerId
    const blockedRelations = await prisma.block.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    });
    const blockedUserIds = blockedRelations.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId));

    const bannedRelations = await prisma.userBan.findMany({
      where: { OR: [{ bannedByUserId: user.id }, { bannedUserId: user.id }] },
    });
    const bannedUserIds = bannedRelations.map((b) => (b.bannedByUserId === user.id ? b.bannedUserId : b.bannedByUserId));

    const excludeUserIds = Array.from(
      new Set([user.id, ...blockedUserIds, ...bannedUserIds, ...(excludePartnerId ? [excludePartnerId] : [])])
    );

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

    // 5. Try to atomically match with the earliest waiting candidate
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
            return null; // Candidate was claimed by someone else in a race condition
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

          // Sync active match & queue docs to Firestore for sub-50ms push delivery
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

              // Notify both queue docs in Firestore so listeners fire immediately
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
            console.warn('Firestore match sync error:', e);
          }

          console.log('[RANDOM_CHAT][MATCH]', {
            state: 'matched',
            matchId: newChatSessionId,
            user1Id: user.id,
            user2Id: candidate.userId,
            timestamp: new Date().toISOString(),
          });

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
      } catch (err) {
        console.warn('Matchmaking contention, checking next candidate:', err);
      }
    }

    // 6. No immediate candidate available: Put user into WAITING queue (Requirement 5: One active queue entry)
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

    // Mirror to Firestore queue entry
    try {
      const { getAdminDb } = await import('@/lib/firebaseAdmin');
      const adminDb = getAdminDb();
      if (adminDb) {
        await adminDb.collection('matchmaking').doc(user.id).set(
          {
            uid: user.id,
            userId: user.id,
            status: 'searching',
            matchId: null,
            partnerUid: null,
            joinedAt: Date.now(),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }
    } catch (e) {}

    return NextResponse.json({
      matched: false,
      status: 'WAITING',
      message: 'Looking for a person to chat with you...',
    });
  } catch (error: any) {
    console.error('[RANDOM_CHAT][ERROR]', {
      state: 'join_queue_error',
      error: error?.message || String(error),
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'Failed to join matchmaking queue' }, { status: 500 });
  }
}
