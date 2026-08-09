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
        { error: 'Missing required payment verification fields' },
        { status: 400 }
      );
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      console.error('RAZORPAY_KEY_SECRET is not configured');
      return NextResponse.json({ error: 'Payment gateway configuration error' }, { status: 500 });
    }

    // Razorpay HMAC-SHA256 signature verification formula: HMAC-SHA256(order_id + "|" + payment_id, secret)
    const text = `${razorpayOrderId}|${razorpayPaymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      // Signature mismatch: Mark payment as FAILED and reject activation
      await prisma.payment.updateMany({
        where: { razorpayOrderId },
        data: { status: 'FAILED' },
      });
      return NextResponse.json({ error: 'Invalid payment signature', success: false }, { status: 400 });
    }

    // Signature verified! Update payment status to SUCCESS in database
    await prisma.payment.updateMany({
      where: { razorpayOrderId },
      data: {
        razorpayPaymentId,
        status: 'SUCCESS',
      },
    });

    // Upgrade user to VIP membership
    await prisma.user.update({
      where: { id: user.id },
      data: { membershipTier: 'VIP' },
    });

    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        plan: 'VIP',
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + ONE_YEAR_MS),
      },
      create: {
        userId: user.id,
        plan: 'VIP',
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + ONE_YEAR_MS),
      },
    });

    // Create confirmation notification
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
