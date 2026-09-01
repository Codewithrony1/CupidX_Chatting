import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getCurrentUser(req);
    if (!admin || admin.role !== 'ADMIN') {
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
    });

    if (!paymentRequest) {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
    }

    if (paymentRequest.status === 'approved') {
      return NextResponse.json({ error: 'Payment request has already been approved' }, { status: 400 });
    }

    const now = new Date();
    const isYearly = paymentRequest.plan === 'yearly' || paymentRequest.plan === 'VIP_YEARLY';
    const durationDays = isYearly ? 365 : 30;
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // 1. Mark request as approved
    const updatedRequest = await prisma.paymentRequest.update({
      where: { id: paymentRequest.id },
      data: {
        status: 'approved',
        reviewedAt: now,
        reviewedBy: admin.username,
      },
    });

    // 2. Grant VIP status to user
    await prisma.user.update({
      where: { id: paymentRequest.userId },
      data: {
        membershipTier: 'VIP',
        is_vip: true,
        vip_started_at: now,
        vip_expires_at: expiresAt,
      },
    });

    // 3. Upsert Active Subscription
    await prisma.subscription.upsert({
      where: { userId: paymentRequest.userId },
      create: {
        userId: paymentRequest.userId,
        plan: isYearly ? 'VIP_YEARLY' : 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        startDate: now,
        endDate: expiresAt,
      },
      update: {
        plan: isYearly ? 'VIP_YEARLY' : 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        startDate: now,
        endDate: expiresAt,
      },
    });

    // 4. Log Admin Action
    await prisma.adminLog.create({
      data: {
        adminUserId: admin.id,
        action: 'APPROVE_PAYMENT_REQUEST',
        targetUserId: paymentRequest.userId,
        details: `Approved payment request ${paymentRequest.requestId} (${paymentRequest.plan}) for ₹${paymentRequest.amount}. Granted ${durationDays} days VIP.`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Payment request approved. VIP granted for ${durationDays} days.`,
      request: updatedRequest,
    });
  } catch (error) {
    console.error('Error approving payment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
