import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { authorized, user: admin, adminClerkUserId } = await verifyAdminAccess(req);

    if (!authorized) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await req.json().catch(() => ({}));
    let days = parseInt((body.days || 30).toString(), 10);
    if (body.duration === '1month') days = 30;
    else if (body.duration === '3months') days = 90;
    else if (body.duration === '1year') days = 365;
    if (isNaN(days) || days <= 0) days = 30;

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ id }, { clerkUserId: id }],
      },
    });

    if (!user) {
      try {
        const { getOrCreateUserFromClerk } = await import('@/lib/auth');
        user = await getOrCreateUserFromClerk(id);
      } catch (err) {}
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const isCurrentlyActiveVip = Boolean(
      (user.is_vip || user.membershipTier === 'VIP') &&
      user.vip_expires_at &&
      new Date(user.vip_expires_at).getTime() > now.getTime()
    );

    let baseExpiryDate = now;
    if (isCurrentlyActiveVip && user.vip_expires_at) {
      baseExpiryDate = new Date(user.vip_expires_at);
    }
    const expiresAt = new Date(baseExpiryDate.getTime() + days * 24 * 60 * 60 * 1000);
    const startDate = isCurrentlyActiveVip && user.vip_started_at ? user.vip_started_at : now;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        membershipTier: 'VIP',
        is_vip: true,
        vip_started_at: startDate,
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
        startDate: startDate,
        endDate: expiresAt,
      },
      update: {
        plan: 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        startDate: startDate,
        endDate: expiresAt,
      },
    });

    await prisma.adminLog.create({
      data: {
        adminUserId: admin?.id || 'admin',
        adminClerkId: admin?.clerkUserId || null,
        action: 'ACTIVATE_SUBSCRIPTION',
        targetUserId: user.id,
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        details: `Activated VIP for ${user.username} (${days} days) until ${expiresAt.toISOString()}`,
      },
    });

    // Sync Clerk metadata
    try {
      const targetClerkId = user.clerkUserId || user.id;
      if (targetClerkId) {
        const { clerkClient } = await import('@clerk/nextjs/server');
        const client = await clerkClient();
        await client.users.updateUserMetadata(targetClerkId, {
          publicMetadata: {
            is_vip: true,
            membershipTier: 'VIP',
            vip_started_at: startDate.toISOString(),
            vip_expires_at: expiresAt.toISOString(),
          },
        });
      }
    } catch (e) {}

    return NextResponse.json({
      success: true,
      message: `Activated VIP subscription for ${user.username} (${days} days)`,
      subscription,
      vip_expires_at: expiresAt,
      vip_started_at: startDate,
      days,
    });
  } catch (error) {
    console.error('Error activating subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
