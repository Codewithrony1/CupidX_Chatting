import { getCurrentUser } from '@/lib/auth';

export async function verifyAdminAccess(req: Request) {
  const user = await getCurrentUser(req);
  const isLocalAdminMode = process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production';
  const isAdmin = isLocalAdminMode || user?.role === 'ADMIN';

  return {
    authorized: isAdmin,
    user,
    adminId: user?.id || 'admin_local',
    adminFirebaseUid: user?.firebaseUid || null,
  };
}
