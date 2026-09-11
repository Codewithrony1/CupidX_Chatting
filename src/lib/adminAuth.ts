import { getCurrentUser } from '@/lib/auth';

export async function verifyAdminAccess(req: Request) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== 'ADMIN') {
    return {
      authorized: false,
      user: null,
      adminId: null,
      adminClerkUserId: null,
      adminFirebaseUid: null,
    };
  }

  return {
    authorized: true,
    user,
    adminId: user.id,
    adminClerkUserId: user.clerkUserId || null,
    adminFirebaseUid: user.clerkUserId || user.id,
  };
}
