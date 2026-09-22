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

    // Sync live Clerk user count if available
    try {
      const { clerkClient } = await import('@clerk/nextjs/server');
      const client = await clerkClient();
      const clerkCount = await client.users.getCount();
      if (typeof clerkCount === 'number' && clerkCount > totalUsers) {
        totalUsers = clerkCount;
      }
    } catch (e) {
      // Graceful fallback to database user count
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

    return NextResponse.json({
      stats: {
        totalUsers,
        vipUsers,
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
