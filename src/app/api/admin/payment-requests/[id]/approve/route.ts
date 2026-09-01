import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { authorized, user: admin, adminFirebaseUid } = await verifyAdminAccess(req);

    if (!authorized) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { id } = await props.params;
    if (!id) {
      return NextResponse.json({ error: 'Payment request ID required' }, { status: 400 });
    }

    const paymentRequest = await prisma.paymentRequest.findFirst({
      where: {
        OR: [{ id }, { requestId: id }],
      },
      include: {
        user: true,
      },
    });

    if (!paymentRequest) {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
    }

    if (paymentRequest.status === 'APPROVED' || paymentRequest.status === 'approved') {
      return NextResponse.json({ error: 'Payment request has already been approved' }, { status: 400 });
    }

    const now = new Date();
    const isYearly = paymentRequest.plan === 'yearly' || paymentRequest.plan === 'pro_yearly' || paymentRequest.plan === 'VIP_YEARLY';
    const durationDays = isYearly ? 365 : 30;

    const targetUser = paymentRequest.user;
    let baseExpiryDate = now;

    if (targetUser && targetUser.is_vip && targetUser.vip_expires_at && new Date(targetUser.vip_expires_at) > now) {
      baseExpiryDate = new Date(targetUser.vip_expires_at);
    }

    const newExpiresAt = new Date(baseExpiryDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const adminIdentifier = admin?.username || adminFirebaseUid || 'admin';

    await prisma.$transaction([
      prisma.paymentRequest.update({
        where: { id: paymentRequest.id },
        data: {
          status: 'approved',
          reviewedBy: admin?.id || 'admin',
          reviewedAt: now,
        },
      }),
      prisma.user.update({
        where: { id: paymentRequest.userId },
        data: {
          membershipTier: 'VIP',
          is_vip: true,
          vip_started_at: targetUser.vip_started_at || now,
          vip_expires_at: newExpiresAt,
        },
      }),
      prisma.subscription.upsert({
        where: { userId: paymentRequest.userId },
        update: {
          plan: 'VIP',
          isActive: true,
          subscriptionStatus: 'ACTIVE',
          startDate: now,
          endDate: newExpiresAt,
        },
        create: {
          userId: paymentRequest.userId,
          plan: 'VIP',
          isActive: true,
          subscriptionStatus: 'ACTIVE',
          startDate: now,
          endDate: newExpiresAt,
        },
      }),
      prisma.notification.create({
        data: {
          userId: paymentRequest.userId,
          type: 'PAYMENT_APPROVED',
          content: `👑 VIP Activated! Your payment for ${paymentRequest.plan || 'VIP Plan'} was verified. Active until ${newExpiresAt.toLocaleDateString()}.`,
        },
      }),
      prisma.adminLog.create({
        data: {
          adminUserId: admin?.id || 'admin',
          adminFirebaseUid: adminFirebaseUid || null,
          action: 'APPROVE_PAYMENT',
          targetUserId: paymentRequest.userId,
          entityType: 'PAYMENT',
          entityId: paymentRequest.id,
          details: `Approved payment request ${paymentRequest.requestId || paymentRequest.id} for user ${targetUser.username} (${targetUser.email || 'no-email'}) by ${adminIdentifier}. Expiry: ${newExpiresAt.toISOString()}`,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Payment approved and VIP activated successfully',
      vip_expires_at: newExpiresAt,
    });
  } catch (error) {
    console.error('Error approving payment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
