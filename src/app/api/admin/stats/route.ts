import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const totalUsers = await prisma.user.count();
    const onlineUsers = await prisma.profile.count({ where: { isOnline: true } });
    const vipUsers = await prisma.subscription.count({ where: { isActive: true } });
    
    const payments = await prisma.payment.findMany({ where: { status: 'SUCCESS' } });
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0) / 100; // In INR

    const pendingReports = await prisma.report.count({ where: { status: 'PENDING' } });

    return NextResponse.json({
      stats: {
        totalUsers,
        onlineUsers,
        vipUsers,
        totalRevenue,
        pendingReports,
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
