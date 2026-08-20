// In-Memory Match Queue singleton for instant zero-latency matchmaking
export interface QueueCandidate {
  userId: string;
  socketId?: string;
  username: string;
  fullName: string;
  displayName: string;
  avatarEmoji: string;
  avatarUrl?: string | null;
  gender: string;
  preferredGender: string;
  language: string;
  isVIP: boolean;
  joinedAt: number;
  blockedUserIds: string[];
}

class InMemoryMatchQueue {
  private queue: Map<string, QueueCandidate> = new Map();

  public addCandidate(candidate: QueueCandidate) {
    this.queue.set(candidate.userId, {
      ...candidate,
      joinedAt: Date.now(),
    });
  }

  public removeCandidate(userId: string) {
    this.queue.delete(userId);
  }

  public getCandidate(userId: string): QueueCandidate | undefined {
    return this.queue.get(userId);
  }

  public findMatch(user: QueueCandidate): QueueCandidate | null {
    const now = Date.now();
    for (const [candidateId, candidate] of this.queue.entries()) {
      if (candidateId === user.userId) continue;

      // Check blocks
      if (user.blockedUserIds.includes(candidateId) || candidate.blockedUserIds.includes(user.userId)) {
        continue;
      }

      // Preference Check
      const prefUser = user.isVIP ? user.preferredGender : 'auto';
      const prefCand = candidate.isVIP ? candidate.preferredGender : 'auto';

      if (prefUser !== 'auto' && prefUser !== 'any' && prefUser !== candidate.gender) {
        continue;
      }
      if (prefCand !== 'auto' && prefCand !== 'any' && prefCand !== user.gender) {
        continue;
      }

      // Match found! Remove matched candidate from queue
      this.queue.delete(candidateId);
      this.queue.delete(user.userId);
      return candidate;
    }

    return null;
  }

  public size(): number {
    return this.queue.size;
  }

  public clearStale(maxAgeMs: number = 60000) {
    const now = Date.now();
    for (const [userId, candidate] of this.queue.entries()) {
      if (now - candidate.joinedAt > maxAgeMs) {
        this.queue.delete(userId);
      }
    }
  }
}

// Global singleton instance across Next.js reloads
const globalForQueue = globalThis as unknown as {
  inMemoryQueue: InMemoryMatchQueue | undefined;
};

export const inMemoryQueue = globalForQueue.inMemoryQueue ?? new InMemoryMatchQueue();

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.inMemoryQueue = inMemoryQueue;
}
