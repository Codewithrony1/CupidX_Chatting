import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
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

    const { id } = await props.params;
    const body = await req.json().catch(() => ({}));
    const days = parseInt((body.days || 30).toString(), 10);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id }, { clerkUserId: id }],
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        membershipTier: 'VIP',
        is_vip: true,
        vip_started_at: now,
        vip_expires_at: expiresAt,
      },
    });

    const subscription = await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        plan: 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        startDate: now,
        endDate: expiresAt,
      },
      update: {
        plan: 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        startDate: now,
        endDate: expiresAt,
      },
    });

    if (admin?.id) {
      await prisma.adminLog.create({
        data: {
          adminUserId: admin.id,
          adminClerkId: claims?.sub || null,
          action: 'SUBSCRIPTION_ACTIVATED',
          targetUserId: user.id,
          entityType: 'SUBSCRIPTION',
          entityId: subscription.id,
          details: `Manually activated subscription for @${user.username} for ${days} days until ${expiresAt.toISOString()}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Subscription activated for ${days} days.`,
      subscription,
    });
  } catch (error) {
    console.error('Error activating subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
