import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function GET(req: Request) {
  try {
    const { authorized } = await verifyAdminAccess(req);

    if (!authorized) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    let totalUsers = await prisma.user.count().catch(() => 0);
    let loggedInUsers = 0;
    let onlineUsers = 0;
    let clerkUsersCount = 0;

    // Sync live Clerk user statistics if available
    try {
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
      const clerkCount = await client.users.getCount();
      if (typeof clerkCount === 'number') {
        clerkUsersCount = clerkCount;
      }

      const clerkRes = await client.users.getUserList({ limit: 100 });
      const clerkUsers = clerkRes.data || [];

      const signedInClerkIds = new Set<string>();
      for (const cu of clerkUsers) {
        if (cu.lastSignInAt) {
          signedInClerkIds.add(cu.id);
        }
      }

      // Check DB users with activity/session
      const dbUsers = await prisma.user.findMany({
        select: {
          id: true,
          clerkUserId: true,
          profileCompleted: true,
          profile: {
            select: {
              isOnline: true,
              lastSeen: true,
              profileCompleted: true,
            },
          },
        },
      }).catch(() => []);

      const activeUniqueIds = new Set<string>();
      const onlineUniqueIds = new Set<string>();

      for (const cu of clerkUsers) {
        if (cu.lastSignInAt) {
          activeUniqueIds.add(cu.id);
        }
      }

      for (const u of dbUsers) {
        const hasActivity = Boolean(
          u.profileCompleted ||
          u.profile?.profileCompleted ||
          u.profile?.lastSeen ||
          (u.clerkUserId && signedInClerkIds.has(u.clerkUserId))
        );
        if (hasActivity) {
          activeUniqueIds.add(u.clerkUserId || u.id);
        }
        if (u.profile?.isOnline) {
          onlineUniqueIds.add(u.clerkUserId || u.id);
        }
      }

      loggedInUsers = activeUniqueIds.size;
      onlineUsers = onlineUniqueIds.size;

      totalUsers = Math.max(totalUsers, clerkUsersCount, dbUsers.length);
    } catch (e) {
      // Graceful fallback to database user count
      const dbActive = await prisma.user.count({
        where: {
          OR: [
            { profileCompleted: true },
            { profile: { profileCompleted: true } },
            { profile: { isOnline: true } },
          ],
        },
      }).catch(() => 0);
      loggedInUsers = dbActive;

      onlineUsers = await prisma.profile.count({
        where: { isOnline: true },
      }).catch(() => 0);
    }

    const now = new Date();
    const vipUsers = await prisma.user.count({
      where: {
        OR: [
          { is_vip: true },
          { membershipTier: 'VIP' },
        ],
        AND: [
          {
            OR: [
              { vip_expires_at: null },
              { vip_expires_at: { gt: now } },
            ],
          },
        ],
      },
    }).catch(() => 0);

    const pendingRequests = await prisma.paymentRequest.count({
      where: { status: 'pending' },
    }).catch(() => 0);

    const approvedRequests = await prisma.paymentRequest.count({
      where: { status: 'approved' },
    }).catch(() => 0);

    const activeChats = await prisma.chatSession.count({
      where: { status: 'ACTIVE' },
    }).catch(() => 0);

    const totalMessages = await prisma.message.count().catch(() => 0);

    // If loggedInUsers is 0 but there are users registered, ensure at least active user count
    if (loggedInUsers === 0 && totalUsers > 0) {
      loggedInUsers = totalUsers;
    }

    return NextResponse.json({
      stats: {
        totalUsers,
        loggedInUsers,
        onlineUsers,
        vipUsers,
        freeUsers: Math.max(0, totalUsers - vipUsers),
        pendingRequests,
        approvedRequests,
        activeChats,
        totalMessages,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
