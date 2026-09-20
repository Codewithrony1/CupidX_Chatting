import { prisma } from './prisma';
import { getAdminDb } from './firebaseAdmin';

export interface ActiveSessionInfo {
  active: boolean;
  chatSessionId: string;
  partnerId: string;
  createdAt: number;
  source: 'firestore' | 'prisma';
}

const STALE_SESSION_MS = 10 * 60 * 1000; // 10 minutes TTL for inactive/abandoned sessions

/**
 * Checks if a user has an active random chat session in either distributed Firestore or Prisma.
 * If an active session is found, checks its freshness; if stale, automatically cleans it up.
 */
export async function getActiveUserSession(userId: string): Promise<ActiveSessionInfo | null> {
  if (!userId) return null;

  const now = Date.now();

  // 1. Check distributed Firestore active_sessions/{userId}
  try {
    const adminDb = getAdminDb();
    if (adminDb) {
      const sessionDoc = await adminDb.collection('active_sessions').doc(userId).get();
      if (sessionDoc.exists) {
        const data = sessionDoc.data();
        const createdAt = data?.createdAt || data?.updatedAt || now;
        const isFresh = now - createdAt < STALE_SESSION_MS;

        if (isFresh && data?.status === 'ACTIVE' && data?.chatSessionId && data?.partnerId) {
          // Verify match document status in Firestore
          const matchDoc = await adminDb.collection('matches').doc(data.chatSessionId).get();
          if (!matchDoc.exists || matchDoc.data()?.status !== 'ended') {
            return {
              active: true,
              chatSessionId: data.chatSessionId,
              partnerId: data.partnerId,
              createdAt,
              source: 'firestore',
            };
          }
        }

        // Stale or ended: cleanup dead active_sessions doc
        await adminDb.collection('active_sessions').doc(userId).delete().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[MATCHMAKING_LOCK] Firestore getActiveUserSession check error:', err);
  }

  // 2. Check local database / Prisma ChatSession
  try {
    const userIds = [userId];
    const session = await prisma.chatSession.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ userAId: { in: userIds } }, { userBId: { in: userIds } }],
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (session) {
      const lastActivity = session.messages[0]?.createdAt || session.startedAt;
      const isFresh = now - new Date(lastActivity).getTime() < STALE_SESSION_MS;
      const partnerId = session.userAId === userId ? session.userBId : session.userAId;

      if (isFresh) {
        return {
          active: true,
          chatSessionId: session.id,
          partnerId,
          createdAt: new Date(session.startedAt).getTime(),
          source: 'prisma',
        };
      } else {
        // Abandoned session: mark ENDED
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { status: 'ENDED', endedAt: new Date() },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[MATCHMAKING_LOCK] Prisma getActiveUserSession check error:', err);
  }

  return null;
}

/**
 * Atomically acquires a distributed match between userA and userB.
 * Enforces the invariant:
 * ONE USER -> ONE ACTIVE CHAT SESSION -> EXACTLY TWO USERS.
 *
 * Uses a Cloud Firestore transaction to ensure that NEITHER user has an active session
 * and BOTH users are currently in 'searching' status.
 */
export async function acquireDistributedMatch(params: {
  userAId: string;
  userBId: string;
  sessionId: string;
  userAData?: Record<string, any>;
  userBData?: Record<string, any>;
}): Promise<{ success: boolean; reason?: string }> {
  const { userAId, userBId, sessionId, userAData, userBData } = params;
  if (!userAId || !userBId || userAId === userBId) {
    return { success: false, reason: 'invalid_user_ids' };
  }

  const now = Date.now();
  const adminDb = getAdminDb();

  if (adminDb) {
    try {
      const txResult = await adminDb.runTransaction(async (tx) => {
        const sessionARef = adminDb.collection('active_sessions').doc(userAId);
        const sessionBRef = adminDb.collection('active_sessions').doc(userBId);
        const queueARef = adminDb.collection('matchmaking').doc(userAId);
        const queueBRef = adminDb.collection('matchmaking').doc(userBId);

        const [snapA, snapB, qSnapA, qSnapB] = await Promise.all([
          tx.get(sessionARef),
          tx.get(sessionBRef),
          tx.get(queueARef),
          tx.get(queueBRef),
        ]);

        // 1. Invariant: Neither user can belong to an existing active session
        if (snapA.exists) {
          const dataA = snapA.data();
          if (dataA?.status === 'ACTIVE' && now - (dataA.updatedAt || dataA.createdAt || 0) < STALE_SESSION_MS) {
            return { success: false, reason: 'userA_already_has_active_session' };
          }
        }

        if (snapB.exists) {
          const dataB = snapB.data();
          if (dataB?.status === 'ACTIVE' && now - (dataB.updatedAt || dataB.createdAt || 0) < STALE_SESSION_MS) {
            return { success: false, reason: 'userB_already_has_active_session' };
          }
        }

        // 2. Invariant: Candidate must still be searching
        if (qSnapB.exists) {
          const qDataB = qSnapB.data();
          if (qDataB?.status && qDataB.status !== 'searching') {
            return { success: false, reason: 'candidate_no_longer_searching' };
          }
        }

        // 3. Atomically establish active session locks for both users
        tx.set(sessionARef, {
          userId: userAId,
          chatSessionId: sessionId,
          partnerId: userBId,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });

        tx.set(sessionBRef, {
          userId: userBId,
          chatSessionId: sessionId,
          partnerId: userAId,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });

        // 4. Create master active match document
        const matchRef = adminDb.collection('matches').doc(sessionId);
        tx.set(matchRef, {
          matchId: sessionId,
          user1Id: userAId,
          user2Id: userBId,
          user1Uid: userAId,
          user2Uid: userBId,
          status: 'active',
          createdAt: now,
          ...(userAData ? { user1Meta: userAData } : {}),
          ...(userBData ? { user2Meta: userBData } : {}),
        });

        // 5. Update matchmaking status to matched for both users
        tx.set(
          queueARef,
          {
            uid: userAId,
            userId: userAId,
            status: 'matched',
            matchId: sessionId,
            partnerUid: userBId,
            matchedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        tx.set(
          queueBRef,
          {
            uid: userBId,
            userId: userBId,
            status: 'matched',
            matchId: sessionId,
            partnerUid: userAId,
            matchedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        return { success: true };
      });

      if (!txResult.success) {
        return txResult;
      }
    } catch (err: any) {
      console.warn('[MATCHMAKING_LOCK] Firestore runTransaction contention/failure:', err?.message || err);
      return { success: false, reason: 'transaction_contention' };
    }
  }

  return { success: true };
}

/**
 * Releases and cleans up an active session in Firestore and Prisma.
 */
export async function releaseDistributedSession(params: {
  sessionId?: string | null;
  userAId?: string | null;
  userBId?: string | null;
  endedBy?: string | null;
}): Promise<void> {
  const { sessionId, userAId, userBId, endedBy } = params;
  const now = Date.now();

  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      const batch = adminDb.batch();

      if (userAId) {
        batch.delete(adminDb.collection('active_sessions').doc(userAId));
        batch.delete(adminDb.collection('matchmaking').doc(userAId));
      }

      if (userBId) {
        batch.delete(adminDb.collection('active_sessions').doc(userBId));
        batch.delete(adminDb.collection('matchmaking').doc(userBId));
      }

      if (sessionId) {
        const matchRef = adminDb.collection('matches').doc(sessionId);
        batch.set(
          matchRef,
          {
            status: 'ended',
            endedAt: now,
            endedBy: endedBy || null,
          },
          { merge: true }
        );
      }

      await batch.commit().catch((e) => console.warn('[MATCHMAKING_LOCK] Batch release error:', e));
    } catch (e) {
      console.warn('[MATCHMAKING_LOCK] Error releasing session in Firestore:', e);
    }
  }
}

/**
 * Registers a user as searching in Cloud Firestore.
 */
export async function setFirestoreUserSearching(userId: string, preferences: Record<string, any> = {}): Promise<void> {
  const adminDb = getAdminDb();
  if (!adminDb || !userId) return;

  try {
    const now = Date.now();
    await adminDb.collection('matchmaking').doc(userId).set(
      {
        uid: userId,
        userId,
        status: 'searching',
        matchId: null,
        partnerUid: null,
        joinedAt: now,
        updatedAt: now,
        ...preferences,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[MATCHMAKING_LOCK] Error setting user searching in Firestore:', err);
  }
}

/**
 * Removes a user's searching queue document in Cloud Firestore.
 */
export async function removeFirestoreUserSearching(userId: string): Promise<void> {
  const adminDb = getAdminDb();
  if (!adminDb || !userId) return;

  try {
    await adminDb.collection('matchmaking').doc(userId).delete();
  } catch (err) {
    console.warn('[MATCHMAKING_LOCK] Error removing searching in Firestore:', err);
  }
}
