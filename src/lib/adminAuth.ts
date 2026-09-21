import { getCurrentUser } from '@/lib/auth';

/**
 * Admin is intentionally LOCAL-ONLY.
 * The admin UI/API must only run from a local development server
 * with ADMIN_MODE enabled (localhost:3000 or localhost:3001). Production users never receive
 * admin authorization, even if their database role/email says ADMIN.
 *
 * SECURITY (ADM-001): This function uses ONLY the server-controlled `host` header
 * for locality verification. The `x-forwarded-host` header is explicitly excluded
 * because it is client-supplied and trivially spoofable by any attacker.
 *
 * Additionally, all admin API requests may require an X-Admin-Secret header if
 * ADMIN_SECRET is set in the environment (enforced at middleware level).
 */
function isLocalAdminRequest(req: Request): boolean {
  const adminMode = process.env.ADMIN_MODE === 'true';
  if (!adminMode) return false;

  // SECURITY: Read ONLY from the `host` header — never from `x-forwarded-host`.
  // Middleware (src/middleware.ts) has already validated the host before any admin
  // request reaches this function, so this is a defence-in-depth check only.
  const url = new URL(req.url);
  const host = (req.headers.get('host') || url.host || '').toLowerCase();

  return (
    host === 'localhost:3000' ||
    host === '127.0.0.1:3000' ||
    host === '[::1]:3000' ||
    host === 'localhost:3001' ||
    host === '127.0.0.1:3001' ||
    host === '[::1]:3001'
  );
}

/**
 * Discriminated union return type for verifyAdminAccess.
 *
 * When `authorized` is true, `user`, `adminId`, and `adminClerkUserId` are
 * all guaranteed to be non-null so callers can safely access them without
 * optional chaining after an `if (!authorized) return` guard.
 */
export type AdminAccessResult =
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; adminId: string; adminClerkUserId: string | null }
  | { authorized: false; user: null; adminId: null; adminClerkUserId: null };

export async function verifyAdminAccess(req: Request): Promise<AdminAccessResult> {
  // Hard security boundary: ADMIN_MODE + loopback host are both required.
  if (!isLocalAdminRequest(req)) {
    return {
      authorized: false,
      user: null,
      adminId: null,
      adminClerkUserId: null,
    };
  }

  // SECURITY (ADM-001): An authenticated Clerk session is REQUIRED.
  // The previous unauthenticated fallback (which granted ADMIN to unauthenticated
  // localhost requests or to the first user in the DB) has been removed because
  // it allowed any process running on localhost to gain admin access without credentials.
  const user = await getCurrentUser(req);

  if (!user) {
    return {
      authorized: false,
      user: null,
      adminId: null,
      adminClerkUserId: null,
    };
  }

  return {
    authorized: true,
    user: { ...user, role: 'ADMIN' } as NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
    adminId: user.id,
    adminClerkUserId: user.clerkUserId || null,
  };
}
