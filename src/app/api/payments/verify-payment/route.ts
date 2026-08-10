import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const razorpayOrderId = body.razorpay_order_id || body.razorpayOrderId;
    const razorpayPaymentId = body.razorpay_payment_id || body.razorpayPaymentId;
    const razorpaySignature = body.razorpay_signature || body.razorpaySignature;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json(
        { error: 'Missing required payment verification parameters' },
        { status: 400 }
      );
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      console.error('RAZORPAY_KEY_SECRET environment variable is missing');
      return NextResponse.json({ error: 'Payment gateway configuration error' }, { status: 500 });
    }

    // Verify HMAC-SHA256 signature server-side: HMAC-SHA256(order_id + "|" + payment_id, secret)
    const text = `${razorpayOrderId}|${razorpayPaymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      // Signature mismatch: Update payment status to FAILED and reject VIP activation
      await prisma.payment.updateMany({
        where: { razorpayOrderId, userId: user.id },
        data: { status: 'FAILED' },
      });
      return NextResponse.json({ error: 'Invalid payment signature', success: false }, { status: 400 });
    }

    // Verify that local payment record exists and belongs to current user
    const existingPayment = await prisma.payment.findUnique({
      where: { razorpayOrderId },
    });

    if (!existingPayment || existingPayment.userId !== user.id) {
      return NextResponse.json({ error: 'Order record mismatch or unauthorized' }, { status: 400 });
    }

    // Update payment record to SUCCESS
    await prisma.payment.update({
      where: { razorpayOrderId },
      data: {
        razorpayPaymentId,
        status: 'SUCCESS',
      },
    });

    // Upgrade user's membershipTier to VIP
    await prisma.user.update({
      where: { id: user.id },
      data: { membershipTier: 'VIP' },
    });

    const now = new Date();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Days VIP Period

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        plan: 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        razorpayOrderId,
        razorpayPaymentId,
        startDate: now,
        endDate: periodEnd,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      create: {
        userId: user.id,
        plan: 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        razorpayOrderId,
        razorpayPaymentId,
        startDate: now,
        endDate: periodEnd,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    // Send confirmation notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'PAYMENT',
        content: '🎉 Payment Verified! Welcome to CupidX VIP Membership.',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment verified and VIP subscription activated.',
    });
  } catch (error: any) {
    console.error('Razorpay Verification Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Error verifying payment signature' },
      { status: 500 }
    );
  }
}
