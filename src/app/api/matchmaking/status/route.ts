import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, getOrCreateUserFromClerk } from '@/lib/auth';

async function resolveCanonicalUserId(identifier: string, displayName = 'Stranger'): Promise<string> {
  if (!identifier) return identifier;
  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ id: identifier }, { clerkUserId: identifier }] },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const suffix = Math.random().toString(36).slice(2, 6);
    const created = await prisma.user.create({
      data: {
        id: identifier,
        clerkUserId: identifier,
        username: `user_${identifier.slice(-6)}_${suffix}`,
        fullName: displayName,
        displayName: displayName,
        gender: 'unspecified',
        profile: {
          create: {
            gender: 'unspecified',
            avatarEmoji: '😊',
          },
        },
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    const fallback = await prisma.user.findFirst({
      where: { OR: [{ id: identifier }, { clerkUserId: identifier }] },
      select: { id: true },
    });
    return fallback ? fallback.id : identifier;
  }
}

export async function GET(req: Request) {
  try {
    let user = await getCurrentUser(req);
    if (!user) {
      const headerClerkId = req.headers.get('x-clerk-user-id');
      const { searchParams } = new URL(req.url);
      const queryClerkId = searchParams.get('clerkUserId');
      const fallbackClerkId = headerClerkId || queryClerkId;
      if (fallbackClerkId) {
        user = await getOrCreateUserFromClerk(fallbackClerkId);
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Check user's MatchmakingQueue entry
    let userQueue = await prisma.matchmakingQueue.findUnique({
      where: { userId: user.id },
    });

    // Cross-container serverless fallback: check Firestore matchmaking queue entry
    if (!userQueue || userQueue.status === 'IDLE') {
      try {
        const { getAdminDb } = await import('@/lib/firebaseAdmin');
        const adminDb = getAdminDb();
        if (adminDb) {
          const queueSnap = await adminDb.collection('matchmaking').doc(user.id).get();
          if (queueSnap.exists) {
            const qData = queueSnap.data();
            if (qData?.status === 'matched' && qData?.matchId) {
              userQueue = await prisma.matchmakingQueue.upsert({
                where: { userId: user.id },
                update: {
                  status: 'MATCHED',
                  chatSessionId: qData.matchId,
                  partnerUserId: qData.partnerUid || null,
                  updatedAt: new Date(),
                },
                create: {
                  userId: user.id,
                  status: 'MATCHED',
                  chatSessionId: qData.matchId,
                  partnerUserId: qData.partnerUid || null,
                },
              });
            } else if (qData?.status === 'searching') {
              userQueue = await prisma.matchmakingQueue.upsert({
                where: { userId: user.id },
                update: { status: 'WAITING', updatedAt: new Date() },
                create: { userId: user.id, status: 'WAITING' },
              });
            }
          }
        }
      } catch (e) {
        console.warn('[STATUS_ROUTE] Firestore queue fallback error:', e);
      }
    }

    if (!userQueue) {
      return NextResponse.json({ matched: false, status: 'IDLE' });
    }

    // 2. If already MATCHED, verify active session, fetch partner details and return
    if (userQueue.status === 'MATCHED' && userQueue.chatSessionId) {
      let session = await prisma.chatSession.findUnique({
        where: { id: userQueue.chatSessionId },
      });

      if (!session) {
        // Cross-container serverless fallback: check Firestore matches collection
        try {
          const { getAdminDb } = await import('@/lib/firebaseAdmin');
          const adminDb = getAdminDb();
          if (adminDb) {
            const snap = await adminDb.collection('matches').doc(userQueue.chatSessionId).get();
            if (snap.exists) {
              const matchDoc = snap.data();
              if (matchDoc && matchDoc.status === 'active') {
                const uAId = matchDoc.user1DbId || matchDoc.user1Uid;
                const uBId = matchDoc.user2DbId || matchDoc.user2Uid;
                const [canonicalA, canonicalB] = await Promise.all([
                  resolveCanonicalUserId(uAId, matchDoc.user1DisplayName || 'Stranger'),
                  resolveCanonicalUserId(uBId, matchDoc.user2DisplayName || 'Stranger'),
                ]);
                session = await prisma.chatSession.upsert({
                  where: { id: userQueue.chatSessionId },
                  update: { status: 'ACTIVE' },
                  create: {
                    id: userQueue.chatSessionId,
                    userAId: canonicalA,
                    userBId: canonicalB,
                    status: 'ACTIVE',
                  },
                });
              }
            }
          }
        } catch (e) {
          console.warn('[STATUS_ROUTE] Firestore match fallback error:', e);
        }
      }

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
      } else if (session && session.status === 'ENDED') {
        // Session explicitly confirmed ENDED in database
        return NextResponse.json({ matched: false, status: 'ENDED' });
      } else {
        // Session is not yet synced in local container cache: keep waiting, DO NOT emit premature ENDED
        return NextResponse.json({ matched: false, status: 'WAITING' });
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
    console.error('[RANDOM_CHAT][ERROR]', {
      state: 'status_check_error',
      error: error?.message || String(error),
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: 'Failed to fetch matchmaking status' }, { status: 500 });
  }
}

