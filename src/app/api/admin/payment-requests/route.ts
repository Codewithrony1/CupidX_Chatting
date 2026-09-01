import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function GET(req: Request) {
  try {
    const { authorized } = await verifyAdminAccess(req);

    if (!authorized) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status') || 'UNDER_REVIEW';
    const regionFilter = searchParams.get('region');

    const whereClause: any = {};
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' || statusFilter === 'UNDER_REVIEW') {
        whereClause.status = { in: ['pending', 'UNDER_REVIEW'] };
      } else if (statusFilter === 'approved' || statusFilter === 'APPROVED') {
        whereClause.status = { in: ['approved', 'APPROVED'] };
      } else if (statusFilter === 'rejected' || statusFilter === 'REJECTED') {
        whereClause.status = { in: ['rejected', 'REJECTED'] };
      }
    }

    if (regionFilter && regionFilter !== 'all' && ['india', 'international'].includes(regionFilter)) {
      whereClause.region = regionFilter;
    }

    const requests = await prisma.paymentRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firebaseUid: true,
            username: true,
            fullName: true,
            displayName: true,
            email: true,
            gender: true,
            membershipTier: true,
            is_vip: true,
            vip_expires_at: true,
          },
        },
      },
    });

    const enrichedRequests = requests.map((item) => ({
      ...item,
      clerkUser: {
        id: item.user.id,
        email: item.user.email || null,
        name: item.user.fullName || item.user.username,
        avatar: null,
      },
    }));

    return NextResponse.json({ requests: enrichedRequests });
  } catch (error) {
    console.error('Error fetching manual payment requests for admin:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
