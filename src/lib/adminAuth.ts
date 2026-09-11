import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function verifyAdminAccess(req: Request) {
  const isLocalAdminMode = process.env.ADMIN_MODE === 'true';
  const user = await getCurrentUser(req);

  // Production or DB role check
  if (user && user.role === 'ADMIN') {
    return {
      authorized: true,
      user,
      adminId: user.id,
      adminClerkUserId: user.clerkUserId || null,
      adminFirebaseUid: user.clerkUserId || user.id,
    };
  }

  // Local development admin mode (`npm run admin` on localhost:3001)
  if (isLocalAdminMode) {
    if (user) {
      return {
        authorized: true,
        user: { ...user, role: 'ADMIN' },
        adminId: user.id,
        adminClerkUserId: user.clerkUserId || null,
        adminFirebaseUid: user.clerkUserId || user.id,
      };
    }

    // Fallback admin user for local headless testing or port 3001 without auth cookie
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

  return {
    authorized: false,
    user: null,
    adminId: null,
    adminClerkUserId: null,
    adminFirebaseUid: null,
  };
}
