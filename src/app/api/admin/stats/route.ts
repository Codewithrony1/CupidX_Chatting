import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    const sessionAuth = await auth().catch(() => null);
    const claims = sessionAuth?.sessionClaims as any;
    const clerkRole = claims?.metadata?.role || claims?.role || claims?.publicMetadata?.role;

    const isLocalAdminMode = process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production';
    const isAdmin = isLocalAdminMode || user?.role === 'ADMIN' || clerkRole === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const totalUsers = await prisma.user.count();
    const vipUsers = await prisma.user.count({
      where: {
        OR: [
          { is_vip: true },
          { membershipTier: 'VIP' },
        ],
      },
    });

    const pendingRequests = await prisma.paymentRequest.count({
      where: { status: 'pending' },
    });

    const approvedRequests = await prisma.paymentRequest.count({
      where: { status: 'approved' },
    });

    const activeChats = await prisma.chatSession.count({
      where: { status: 'ACTIVE' },
    });

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
