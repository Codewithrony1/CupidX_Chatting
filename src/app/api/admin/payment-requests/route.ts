import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request) {
  try {
    const admin = await getCurrentUser(req);
    const sessionAuth = await auth().catch(() => null);
    const claims = sessionAuth?.sessionClaims as any;
    const clerkRole = claims?.metadata?.role || claims?.role || claims?.publicMetadata?.role;

    const isLocalAdminMode = process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production';
    const isAdmin = isLocalAdminMode || admin?.role === 'ADMIN' || clerkRole === 'admin';

    if (!isAdmin) {
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
            clerkUserId: true,
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

    // Populate Clerk metadata if user record has it
    const formattedRequests = requests.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      userId: r.userId,
      clerkUserId: r.clerkUserId || r.user?.clerkUserId || 'N/A',
      userEmail: r.userEmail || r.user?.email || 'N/A',
      userName: r.userFullName || r.user?.fullName || r.username,
      username: r.username,
      plan: r.plan,
      planId: r.planId,
      region: r.region,
      amount: r.amount,
      currency: r.currency,
      paymentId: r.paymentId,
      screenshotUrl: r.screenshotUrl,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      reviewedBy: r.reviewedBy,
      user: r.user,
    }));

    return NextResponse.json({ requests: formattedRequests });
  } catch (error) {
    console.error('Error fetching admin payment requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
