import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Admin is intentionally LOCAL-ONLY.
 * The admin UI/API must only run from a local development server
 * with ADMIN_MODE enabled (localhost:3000 or localhost:3001). Production users never receive
 * admin authorization, even if their database role/email says ADMIN.
 */
function isLocalAdminRequest(req: Request): boolean {
  const adminMode = process.env.ADMIN_MODE === 'true';
  if (!adminMode) return false;

  const url = new URL(req.url);
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = (forwardedHost || req.headers.get('host') || url.host || '').toLowerCase();

  return (
    host === 'localhost:3000' ||
    host === '127.0.0.1:3000' ||
    host === '[::1]:3000' ||
    host === 'localhost:3001' ||
    host === '127.0.0.1:3001' ||
    host === '[::1]:3001'
  );
}

export async function verifyAdminAccess(req: Request) {
  // Hard security boundary: ADMIN_MODE + loopback host are both required.
  if (!isLocalAdminRequest(req)) {
    return {
      authorized: false,
      user: null,
      adminId: null,
      adminClerkUserId: null,
      adminFirebaseUid: null,
    };
  }

  const user = await getCurrentUser(req);

  // Local development admin mode (npm run dev or npm run admin).
  if (user) {
    return {
      authorized: true,
      user: { ...user, role: 'ADMIN' },
      adminId: user.id,
      adminClerkUserId: user.clerkUserId || null,
      adminFirebaseUid: user.clerkUserId || user.id,
    };
  }

  // Fallback admin user for local headless testing without an auth cookie.
  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    }) || await prisma.user.findFirst();

    if (existingAdmin) {
      return {
        authorized: true,
        user: { ...existingAdmin, role: 'ADMIN' },
        adminId: existingAdmin.id,
        adminClerkUserId: existingAdmin.clerkUserId || null,
        adminFirebaseUid: existingAdmin.clerkUserId || existingAdmin.id,
      };
    }
  } catch (e) {}

  return {
    authorized: true,
    user: {
      id: 'admin_local_dev',
      clerkUserId: 'admin_local_dev',
      username: 'admin',
      email: 'admin@cupidxchat.in',
      role: 'ADMIN',
      is_vip: true,
    } as any,
    adminId: 'admin_local_dev',
    adminClerkUserId: 'admin_local_dev',
    adminFirebaseUid: 'admin_local_dev',
  };
}
