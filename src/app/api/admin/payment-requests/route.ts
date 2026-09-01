import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const admin = await getCurrentUser(req);
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status') || 'pending';
    const regionFilter = searchParams.get('region');

    const whereClause: any = {};
    if (statusFilter !== 'all' && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      whereClause.status = statusFilter;
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

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching admin payment requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
