/**
 * CupidX — Bulletproof Firestore Matchmaking & Realtime Chat
 */

import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  addDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueueEntry {
  uid: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  avatarEmoji: string;
  gender: string;
  genderPref: string;
  mood: string;
  isVIP: boolean;
  status: 'searching' | 'matched';
  matchId?: string;
  partnerUid?: string;
  matchedAt?: number;
  joinedAt: number;
  updatedAt: number;
}

export interface MatchDoc {
  matchId: string;
  user1Uid: string;
  user2Uid: string;
  user1DbId: string;
  user2DbId: string;
  user1Username: string;
  user2Username: string;
  user1DisplayName: string;
  user2DisplayName: string;
  user1AvatarUrl: string;
  user2AvatarUrl: string;
  user1AvatarEmoji: string;
  user2AvatarEmoji: string;
  user1IsVIP: boolean;
  user2IsVIP: boolean;
  user1Gender: string;
  user2Gender: string;
  status: 'active' | 'ended';
  createdAt: number;
  endedAt?: number;
  endedBy?: string;
}

export interface FirestoreMessage {
  id: string;
  senderUid: string;
  senderUsername: string;
  content: string;
  imageUrl: string | null;
  createdAt: number;
}

// ─── Ensure User Identity ─────────────────────────────────────────────────────

export async function ensureFirebaseAuth(userId?: string): Promise<string> {
  return userId || 'user_' + Math.random().toString(36).substring(2, 11);
}

// ─── Queue Operations ─────────────────────────────────────────────────────────

/**
 * Join the matchmaking queue.
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
}): Promise<number> {
  const now = Date.now();
  const entry: QueueEntry = {
    uid: params.firebaseUid,
    userId: params.userId || params.firebaseUid,
    username: params.username || 'user',
    displayName: params.displayName || params.username || 'User',
    avatarUrl: params.avatarUrl || '',
    avatarEmoji: params.avatarEmoji || '😊',
    gender: params.gender || 'unspecified',
    genderPref: params.genderPref || 'auto',
    mood: params.mood || '',
    isVIP: Boolean(params.isVIP),
    status: 'searching',
    matchId: '',
    partnerUid: '',
    matchedAt: 0,
    joinedAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'matchmaking', params.firebaseUid), entry);
  return now;
}

/**
 * Keep the searching presence alive without overwriting matched status.
 */
export async function heartbeatQueue(firebaseUid: string): Promise<void> {
  try {
    const ref = doc(db, 'matchmaking', firebaseUid);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data()?.status === 'searching') {
      await updateDoc(ref, {
        updatedAt: Date.now(),
      });
    }
  } catch {
    // Ignore
  }
}

/**
 * Remove user from matchmaking queue.
 */
export async function leaveQueue(firebaseUid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'matchmaking', firebaseUid));
  } catch {
    // Ignore
  }
}

// ─── Match Finding ────────────────────────────────────────────────────────────

/**
 * Scan for active searching candidates and atomically pair.
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
  const now = Date.now();
  const ACTIVE_HEARTBEAT_THRESHOLD = now - 30000; // Must have sent heartbeat in last 30s

  const q = query(
    collection(db, 'matchmaking'),
    where('status', '==', 'searching'),
    limit(25)
  );

  const snapshot = await getDocs(q);
  const candidates: QueueEntry[] = [];

  for (const docSnap of snapshot.docs) {
    const d = docSnap.data() as QueueEntry;
    if (!d.uid) continue;

    // Clean up dead ghost entries
    if (d.updatedAt && d.updatedAt < ACTIVE_HEARTBEAT_THRESHOLD - 30000) {
      deleteDoc(docSnap.ref).catch(() => {});
      continue;
    }

    // Filter out self and inactive candidates
    if (d.uid !== firebaseUid && d.userId !== params.userId) {
      if (d.updatedAt && d.updatedAt >= ACTIVE_HEARTBEAT_THRESHOLD) {
        candidates.push(d);
      }
    }
  }

  // Sort earliest joined first
  candidates.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

  for (const candidate of candidates) {
    // Gender filters
    if (isVIP && genderPref !== 'auto' && genderPref !== 'any') {
      if (candidate.gender !== genderPref) continue;
    }
    if (candidate.isVIP && candidate.genderPref !== 'auto' && candidate.genderPref !== 'any') {
      if (candidate.genderPref !== (params.gender || 'unspecified')) continue;
    }

    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    try {
      const success = await runTransaction(db, async (tx) => {
        const candidateRef = doc(db, 'matchmaking', candidate.uid);
        const selfRef = doc(db, 'matchmaking', firebaseUid);

        const [candidateSnap, selfSnap] = await Promise.all([
          tx.get(candidateRef),
          tx.get(selfRef),
        ]);

        if (!candidateSnap.exists() || candidateSnap.data()?.status !== 'searching') {
          return false;
        }
        if (!selfSnap.exists() || selfSnap.data()?.status !== 'searching') {
          return false;
        }

        const selfData = selfSnap.data() as QueueEntry;
        const matchNow = Date.now();

        // 1. Create active match document
        const matchRef = doc(db, 'matches', matchId);
        const matchData: MatchDoc = {
          matchId,
          user1Uid: firebaseUid,
          user2Uid: candidate.uid,
          user1DbId: selfData.userId || firebaseUid,
          user2DbId: candidate.userId || candidate.uid,
          user1Username: selfData.username || 'user',
          user2Username: candidate.username || 'user',
          user1DisplayName: selfData.displayName || selfData.username || 'User',
          user2DisplayName: candidate.displayName || candidate.username || 'User',
          user1AvatarUrl: selfData.avatarUrl || '',
          user2AvatarUrl: candidate.avatarUrl || '',
          user1AvatarEmoji: selfData.avatarEmoji || '😊',
          user2AvatarEmoji: candidate.avatarEmoji || '😊',
          user1IsVIP: Boolean(selfData.isVIP),
          user2IsVIP: Boolean(candidate.isVIP),
          user1Gender: selfData.gender || 'unspecified',
          user2Gender: candidate.gender || 'unspecified',
          status: 'active',
          createdAt: matchNow,
        };
        tx.set(matchRef, matchData);

        // 2. Mark candidate as matched
        tx.update(candidateRef, {
          status: 'matched',
          matchId,
          partnerUid: firebaseUid,
          matchedAt: matchNow,
          updatedAt: matchNow,
        });

        // 3. Mark self as matched
        tx.update(selfRef, {
          status: 'matched',
          matchId,
          partnerUid: candidate.uid,
          matchedAt: matchNow,
          updatedAt: matchNow,
        });

        return true;
      });

      if (success) {
        return matchId;
      }
    } catch (err) {
      console.warn('Match transaction attempt error:', err);
    }
  }

  return null;
}

// ─── Real-time Listeners ──────────────────────────────────────────────────────

/**
 * Listen to own queue doc. Only fires for matches created after sessionStartedAt.
 */
export function listenToMyQueueEntry(
  firebaseUid: string,
  sessionStartedAt: number,
  onMatched: (matchId: string, partnerUid: string) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'matchmaking', firebaseUid),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as QueueEntry;
      if (
        data.status === 'matched' &&
        data.matchId &&
        data.partnerUid &&
        (data.matchedAt ? data.matchedAt >= sessionStartedAt - 5000 : true)
      ) {
        onMatched(data.matchId, data.partnerUid);
      }
    },
    onError
  );
}

/**
 * Listen to active match document.
 */
export function listenToMatch(
  matchId: string,
  onUpdate: (match: MatchDoc) => void,
  onError?: (e: Error) => void
): () => void {
  return onSnapshot(
    doc(db, 'matches', matchId),
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as MatchDoc);
      }
    },
    onError
  );
}

/**
 * Listen to messages in a match.
 */
export function listenToMessages(
  matchId: string,
  onMessages: (messages: FirestoreMessage[]) => void,
  onError?: (e: Error) => void
): () => void {
  const q = query(
    collection(db, 'matches', matchId, 'messages'),
    limit(200)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: FirestoreMessage[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreMessage, 'id'>),
      }));

      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      onMessages(msgs);
    },
    onError
  );
}

// ─── Messaging ────────────────────────────────────────────────────────────────

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
    createdAt: Date.now(),
  });
}

// ─── Match Lifecycle ──────────────────────────────────────────────────────────

export async function endMatch(matchId: string, endedByUid?: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'ended',
      endedAt: Date.now(),
      endedBy: endedByUid || '',
    });
  } catch {
    // Ignore if already deleted/ended
  }
}

export async function cleanupSession(
  firebaseUid: string,
  matchId: string | null
): Promise<void> {
  await Promise.allSettled([
    matchId ? endMatch(matchId, firebaseUid) : Promise.resolve(),
    leaveQueue(firebaseUid),
  ]);
}

export function resolveTimestamp(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'number') return new Date(ts).toISOString();
  if (typeof ts === 'string') return ts;
  if (ts instanceof Date) return ts.toISOString();
  if (ts?.toDate) return ts.toDate().toISOString();
  return new Date().toISOString();
}
