import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const now = new Date();

    // 1. Find users whose VIP subscription has expired
    const expiredUsers = await prisma.user.findMany({
      where: {
        is_vip: true,
        vip_expires_at: {
          lte: now,
        },
      },
      select: { id: true, username: true },
    });

    if (expiredUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired VIP subscriptions found.',
        count: 0,
      });
    }

    const expiredUserIds = expiredUsers.map((u) => u.id);

    // 2. Set is_vip = false, membershipTier = 'FREE'
    await prisma.user.updateMany({
      where: {
        id: { in: expiredUserIds },
      },
      data: {
        is_vip: false,
        membershipTier: 'FREE',
      },
    });

    // 3. Deactivate Subscriptions
    await prisma.subscription.updateMany({
      where: {
        userId: { in: expiredUserIds },
      },
      data: {
        isActive: false,
        subscriptionStatus: 'EXPIRED',
      },
    });

    return NextResponse.json({
      success: true,
      message: `Successfully expired ${expiredUsers.length} VIP subscriptions.`,
      count: expiredUsers.length,
      expiredUsers,
    });
  } catch (error) {
    console.error('Error executing VIP auto-expiry cron:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
