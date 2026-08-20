// In-memory rate limiting tracker (Account + IP dual keying to protect Indian CGNAT users)
interface RateLimitRecord {
  attempts: number;
  blockedUntil: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

export function checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): { isBlocked: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record) {
    return { isBlocked: false, retryAfterSeconds: 0 };
  }

  if (now < record.blockedUntil) {
    const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return { isBlocked: true, retryAfterSeconds };
  }

  if (record.attempts >= maxAttempts) {
    record.blockedUntil = now + windowMs;
    const retryAfterSeconds = Math.ceil(windowMs / 1000);
    return { isBlocked: true, retryAfterSeconds };
  }

  return { isBlocked: false, retryAfterSeconds: 0 };
}

export function recordFailedAttempt(key: string, windowMs: number = 15 * 60 * 1000) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { attempts: 0, blockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= 5) {
    record.blockedUntil = now + windowMs;
  }
  rateLimitMap.set(key, record);
}

export function clearRateLimit(key: string) {
  rateLimitMap.delete(key);
}
