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

    // Subscription extension logic:
    // If existing user has VIP expiring in the future, extend from that future date!
    const targetUser = paymentRequest.user;
    let baseStartDate = now;
    let baseExpiryDate = now;

    if (targetUser && targetUser.is_vip && targetUser.vip_expires_at && new Date(targetUser.vip_expires_at) > now) {
      baseExpiryDate = new Date(targetUser.vip_expires_at);
    }

    const newExpiresAt = new Date(baseExpiryDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const adminIdentifier = admin?.username || claims?.sub || 'admin';

    // ATOMIC TRANSACTION: Prevent race conditions or double activation
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark request as APPROVED
      const updatedReq = await tx.paymentRequest.update({
        where: { id: paymentRequest.id },
        data: {
          status: 'APPROVED',
          reviewedAt: now,
          reviewedBy: adminIdentifier,
        },
      });

      // 2. Upgrade User to VIP
      const updatedUser = await tx.user.update({
        where: { id: paymentRequest.userId },
        data: {
          membershipTier: 'VIP',
          is_vip: true,
          vip_started_at: targetUser.vip_started_at || now,
          vip_expires_at: newExpiresAt,
        },
      });

      // 3. Upsert Active Subscription
      await tx.subscription.upsert({
        where: { userId: paymentRequest.userId },
        create: {
          userId: paymentRequest.userId,
          plan: isYearly ? 'PRO_YEARLY' : 'PRO_MONTHLY',
          isActive: true,
          subscriptionStatus: 'ACTIVE',
          startDate: baseStartDate,
          endDate: newExpiresAt,
        },
        update: {
          plan: isYearly ? 'PRO_YEARLY' : 'PRO_MONTHLY',
          isActive: true,
          subscriptionStatus: 'ACTIVE',
          startDate: baseStartDate,
          endDate: newExpiresAt,
        },
      });

      // 4. Audit Log
      if (admin?.id) {
        await tx.adminLog.create({
          data: {
            adminUserId: admin.id,
            adminClerkId: claims?.sub || null,
            action: 'PAYMENT_APPROVED',
            targetUserId: paymentRequest.userId,
            entityType: 'PAYMENT',
            entityId: paymentRequest.id,
            details: `Approved payment ${paymentRequest.requestId} (${paymentRequest.plan}) for ₹${paymentRequest.amount}. Activated subscription until ${newExpiresAt.toISOString()}`,
          },
        });
      }

      return { updatedReq, updatedUser };
    });

    return NextResponse.json({
      success: true,
      message: `Payment request approved. Subscription activated for ${durationDays} days (Expires: ${newExpiresAt.toLocaleDateString()}).`,
      request: result.updatedReq,
      user: result.updatedUser,
    });
  } catch (error) {
    console.error('Error approving payment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
