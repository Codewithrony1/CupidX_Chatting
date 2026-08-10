import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { VIP_CONFIG } from '@/lib/config';
import crypto from 'crypto';
import Razorpay from 'razorpay';

export async function POST(req: Request) {
  try {
    // 1. Authenticate Clerk User
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
    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

    if (!secret || !keyId) {
      console.error('[PAYMENT] RAZORPAY_KEY_SECRET environment variable is missing');
      return NextResponse.json({ error: 'Payment gateway configuration error' }, { status: 500 });
    }

    console.log(`[PAYMENT] Verification started for order ${razorpayOrderId}, payment ${razorpayPaymentId}`);

    // 2. Server-side HMAC-SHA256 signature verification: HMAC(order_id + "|" + payment_id, secret)
    const text = `${razorpayOrderId}|${razorpayPaymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      console.error(`[PAYMENT] Signature verification failed for order ${razorpayOrderId}`);
      await prisma.payment.updateMany({
        where: { razorpayOrderId, userId: user.id },
        data: { status: 'FAILED' },
      });
      return NextResponse.json({ error: 'Invalid payment signature', success: false }, { status: 400 });
    }

    console.log(`[PAYMENT] Signature verified for order ${razorpayOrderId}`);

    // 3. Verify Order Ownership & Amount in Database
    const existingPayment = await prisma.payment.findUnique({
      where: { razorpayOrderId },
    });

    if (!existingPayment) {
      return NextResponse.json({ error: 'Payment order record not found' }, { status: 404 });
    }

    if (existingPayment.userId !== user.id) {
      console.error(`[PAYMENT] Order ownership mismatch: Order ${razorpayOrderId} belongs to ${existingPayment.userId}, attempted by ${user.id}`);
      return NextResponse.json({ error: 'Order record ownership mismatch or unauthorized' }, { status: 403 });
    }

    // Amount Verification: Verify payment amount matches server-side configured price
    if (existingPayment.amount !== VIP_CONFIG.PRICE_PAISE) {
      console.error(`[PAYMENT] Amount mismatch: Expected ${VIP_CONFIG.PRICE_PAISE}, got ${existingPayment.amount}`);
      return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 });
    }

    // 4. Idempotency Check: If payment is already captured and user is VIP, return success cleanly
    if ((existingPayment.status === 'CAPTURED' || existingPayment.status === 'SUCCESS') && user.membershipTier === 'VIP') {
      console.log(`[PAYMENT] Payment ${razorpayPaymentId} already processed and VIP active`);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        message: 'VIP membership is already active.',
      });
    }

    // 5. Query Razorpay API to check actual payment status
    try {
      const razorpay = new Razorpay({ key_id: keyId, key_secret: secret });
      const paymentDetails = await razorpay.payments.fetch(razorpayPaymentId);

      if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
        console.error(`[PAYMENT] Razorpay payment status is ${paymentDetails.status}`);
        return NextResponse.json(
          { error: `Payment is not in a valid paid state (Status: ${paymentDetails.status})` },
          { status: 400 }
        );
      }

      console.log(`[PAYMENT] Razorpay API verified payment status: ${paymentDetails.status}`);
    } catch (apiErr) {
      console.warn('[PAYMENT] Razorpay API status fetch warning (proceeding with verified signature):', apiErr);
    }

    // 6. Update Database: Payment -> CAPTURED, User -> VIP, Subscription -> ACTIVE
    await prisma.payment.update({
      where: { razorpayOrderId },
      data: {
        razorpayPaymentId,
        status: 'CAPTURED',
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { membershipTier: 'VIP' },
    });

    const now = new Date();
    const periodEnd = new Date(Date.now() + VIP_CONFIG.DURATION_DAYS * 24 * 60 * 60 * 1000);

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

    // 7. Log Notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'PAYMENT',
        content: `🎉 VIP Membership Activated! Thank you for subscribing to CupidX VIP (₹${VIP_CONFIG.PRICE_INR}/mo).`,
      },
    });

    console.log(`[PAYMENT] VIP activated for user ${user.id} (${user.username})`);

    return NextResponse.json({
      success: true,
      message: 'VIP membership activated successfully.',
    });
  } catch (error: any) {
    console.error('[PAYMENT] Verification Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Error verifying payment signature' },
      { status: 500 }
    );
  }
}
