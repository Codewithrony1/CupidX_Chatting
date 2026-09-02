/**
 * CupidX — Firebase Firestore Matchmaking & Realtime Chat
 *
 * Replaces the broken Socket.IO + SQLite matchmaking that cannot run on Vercel.
 * Firestore is realtime, serverless-compatible, and supports atomic transactions.
 *
 * Collections:
 *   matchmaking/{firebaseUid}     — queue entry for each searching user
 *   matches/{matchId}             — active match between two users
 *   matches/{matchId}/messages/   — realtime messages subcollection
 */

import { db } from '@/lib/firebase';
import {
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  addDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueueEntry {
  uid: string;          // Firebase UID
  userId: string;       // Prisma DB user ID
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarEmoji: string;
  gender: string;
  genderPref: string;
  mood: string;
  isVIP: boolean;
  status: 'searching' | 'matched';
  matchId?: string;
  partnerUid?: string;
  createdAt: any;
  updatedAt: any;
}

export interface MatchDoc {
  matchId: string;
  user1Uid: string;     // Firebase UID of user 1
  user2Uid: string;     // Firebase UID of user 2
  user1DbId: string;    // Prisma DB ID
  user2DbId: string;
  user1Username: string;
  user2Username: string;
  user1DisplayName: string;
  user2DisplayName: string;
  user1AvatarUrl: string | null;
  user2AvatarUrl: string | null;
  user1AvatarEmoji: string;
  user2AvatarEmoji: string;
  user1IsVIP: boolean;
  user2IsVIP: boolean;
  user1Gender: string;
  user2Gender: string;
  status: 'active' | 'ended';
  createdAt: any;
  endedAt?: any;
}

export interface FirestoreMessage {
  id: string;
  senderUid: string;    // Firebase UID
  senderUsername: string;
  content: string;
  imageUrl: string | null;
  createdAt: any;
}

// ─── Queue Operations ─────────────────────────────────────────────────────────

/**
 * Add current user to the matchmaking queue.
 */
export async function joinQueue(params: {
  firebaseUid: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  avatarEmoji?: string;
  gender?: string;
  genderPref?: string;
  mood?: string;
  isVIP?: boolean;
}): Promise<void> {
  const entry: Omit<QueueEntry, 'matchId' | 'partnerUid'> = {
    uid: params.firebaseUid,
    userId: params.userId,
    username: params.username,
    displayName: params.displayName,
    avatarUrl: params.avatarUrl || null,
    avatarEmoji: params.avatarEmoji || '😊',
    gender: params.gender || 'unspecified',
    genderPref: params.genderPref || 'auto',
    mood: params.mood || '',
    isVIP: params.isVIP || false,
    status: 'searching',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'matchmaking', params.firebaseUid), entry);
}

/**
 * Remove user from the matchmaking queue.
 */
export async function leaveQueue(firebaseUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'matchmaking', firebaseUid));
  } catch {
    // Ignore if already removed
  }
}

// ─── Match Finding ────────────────────────────────────────────────────────────

/**
 * Atomically find a compatible partner and create a match.
 * Returns the matchId if successful, null if no partner found.
 *
 * Uses Firestore transactions to prevent race conditions —
 * two users cannot steal the same partner simultaneously.
 */
export async function findAndMatch(params: {
  firebaseUid: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  avatarEmoji?: string;
  gender?: string;
  genderPref?: string;
  isVIP?: boolean;
}): Promise<string | null> {
  const { firebaseUid, genderPref = 'auto', isVIP = false } = params;

  // Query searching users (limit 20 to scan for best match)
  const q = query(
    collection(db, 'matchmaking'),
    where('status', '==', 'searching'),
    orderBy('createdAt', 'asc'),
    limit(20)
  );

  const snapshot = await getDocs(q);
  const candidates = snapshot.docs
    .map(d => d.data() as QueueEntry)
    .filter(c => c.uid !== firebaseUid);

  for (const candidate of candidates) {
    // Gender preference filter (VIP-only feature)
    if (isVIP && genderPref !== 'auto' && genderPref !== 'any') {
      if (candidate.gender !== genderPref) continue;
    }
    // Also respect candidate's VIP gender preference
    if (candidate.isVIP && candidate.genderPref !== 'auto' && candidate.genderPref !== 'any') {
      if (candidate.genderPref !== (params.gender || 'unspecified')) continue;
    }

    // Attempt atomic match
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      await runTransaction(db, async (tx) => {
        const candidateRef = doc(db, 'matchmaking', candidate.uid);
        const selfRef = doc(db, 'matchmaking', firebaseUid);

        const [candidateSnap, selfSnap] = await Promise.all([
          tx.get(candidateRef),
          tx.get(selfRef),
        ]);

        // Both must still be searching
        if (!candidateSnap.exists() || candidateSnap.data()?.status !== 'searching') {
          throw Object.assign(new Error('CANDIDATE_TAKEN'), { code: 'CANDIDATE_TAKEN' });
        }
        if (!selfSnap.exists() || selfSnap.data()?.status !== 'searching') {
          throw Object.assign(new Error('SELF_TAKEN'), { code: 'SELF_TAKEN' });
        }

        const selfData = selfSnap.data() as QueueEntry;

        // Create the match document
        const matchRef = doc(db, 'matches', matchId);
        tx.set(matchRef, {
          matchId,
          user1Uid: firebaseUid,
          user2Uid: candidate.uid,
          user1DbId: selfData.userId,
          user2DbId: candidate.userId,
          user1Username: selfData.username,
          user2Username: candidate.username,
          user1DisplayName: selfData.displayName,
          user2DisplayName: candidate.displayName,
          user1AvatarUrl: selfData.avatarUrl,
          user2AvatarUrl: candidate.avatarUrl,
          user1AvatarEmoji: selfData.avatarEmoji,
          user2AvatarEmoji: candidate.avatarEmoji,
          user1IsVIP: selfData.isVIP,
          user2IsVIP: candidate.isVIP,
          user1Gender: selfData.gender,
          user2Gender: candidate.gender,
          status: 'active',
          createdAt: serverTimestamp(),
        } as Omit<MatchDoc, 'endedAt'>);

        // Mark both users as matched
        tx.update(candidateRef, {
          status: 'matched',
          matchId,
          partnerUid: firebaseUid,
          updatedAt: serverTimestamp(),
        });
        tx.update(selfRef, {
          status: 'matched',
          matchId,
          partnerUid: candidate.uid,
          updatedAt: serverTimestamp(),
        });
      });

      return matchId; // Match created successfully
    } catch (err: any) {
      if (err.code === 'CANDIDATE_TAKEN' || err.code === 'SELF_TAKEN') {
        continue; // Try next candidate
      }
      throw err; // Unexpected error
    }
  }

  return null; // No compatible partner found yet
}

// ─── Real-time Listeners ──────────────────────────────────────────────────────

/**
 * Listen to own queue entry. Fires when another user matches us.
 * Returns an unsubscribe function.
 */
export function listenToMyQueueEntry(
  firebaseUid: string,
  onMatched: (matchId: string, partnerUid: string) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'matchmaking', firebaseUid),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as QueueEntry;
      if (data.status === 'matched' && data.matchId && data.partnerUid) {
        onMatched(data.matchId, data.partnerUid);
      }
    },
    onError
  );
}

/**
 * Listen to a match document (status, partner info).
 * Returns an unsubscribe function.
 */
export function listenToMatch(
  matchId: string,
  onUpdate: (match: MatchDoc) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'matches', matchId),
    (snap) => {
      if (snap.exists()) onUpdate(snap.data() as MatchDoc);
    },
    onError
  );
}

/**
 * Listen to messages in a match (real-time).
 * Returns an unsubscribe function.
 */
export function listenToMessages(
  matchId: string,
  onMessages: (messages: FirestoreMessage[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(
    collection(db, 'matches', matchId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(500)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: FirestoreMessage[] = snapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreMessage, 'id'>),
      }));
      onMessages(msgs);
    },
    onError
  );
}

// ─── Messaging ────────────────────────────────────────────────────────────────

/**
 * Send a message in a match.
 */
export async function sendFirestoreMessage(
  matchId: string,
  senderUid: string,
  senderUsername: string,
  content: string,
  imageUrl?: string | null
): Promise<void> {
  await addDoc(collection(db, 'matches', matchId, 'messages'), {
    senderUid,
    senderUsername,
    content: content || '',
    imageUrl: imageUrl || null,
    createdAt: serverTimestamp(),
  });
}

// ─── Match Lifecycle ──────────────────────────────────────────────────────────

/**
 * End the current match. Marks it as ended in Firestore
 * so the other user's listener fires and shows "disconnected".
 */
export async function endMatch(matchId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'ended',
      endedAt: serverTimestamp(),
    });
  } catch {
    // Match might already be ended
  }
}

/**
 * Full cleanup: end match + leave queue.
 */
export async function cleanupSession(
  firebaseUid: string,
  matchId: string | null
): Promise<void> {
  await Promise.allSettled([
    matchId ? endMatch(matchId) : Promise.resolve(),
    leaveQueue(firebaseUid),
  ]);
}

/**
 * Resolve Firestore Timestamp or ISO string to a display string.
 */
export function resolveTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) return ts.toISOString();
  if (ts?.toDate) return ts.toDate().toISOString(); // Firestore Timestamp
  return new Date().toISOString();
}
