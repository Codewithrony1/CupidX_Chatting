import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { VIP_CONFIG } from '@/lib/config';
import Razorpay from 'razorpay';

export async function POST(req: Request) {
  try {
    // 1. Authenticate Clerk User
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    // 2. Check if user already has active VIP membership
    const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');
    if (isVIP) {
      return NextResponse.json(
        { error: 'VIP membership is already active on your account.', isAlreadyVIP: true },
        { status: 400 }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error('[PAYMENT] Razorpay environment variables missing');
      return NextResponse.json({ error: 'Razorpay payment gateway not configured' }, { status: 500 });
    }

    const amount = VIP_CONFIG.PRICE_PAISE; // Server-configured VIP price in paise (e.g. 2900 paise = ₹29)
    const currency = VIP_CONFIG.CURRENCY;

    // 3. Prevent unnecessary duplicate orders: check for a recent CREATED order in the last 10 mins
    const TEN_MINS_AGO = new Date(Date.now() - 10 * 60 * 1000);
    const existingPendingPayment = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        status: 'CREATED',
        amount: amount,
        createdAt: { gte: TEN_MINS_AGO },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPendingPayment) {
      console.log(`[PAYMENT] Reusing recent pending Razorpay order ${existingPendingPayment.razorpayOrderId} for user ${user.id}`);
      return NextResponse.json({
        orderId: existingPendingPayment.razorpayOrderId,
        order_id: existingPendingPayment.razorpayOrderId,
        amount: existingPendingPayment.amount,
        currency: existingPendingPayment.currency,
        keyId,
        priceInr: VIP_CONFIG.PRICE_INR,
      });
    }

    // 4. Create fresh Razorpay order
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const receipt = `rcpt_${user.id.substring(0, 8)}_${Date.now()}`;

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt,
      notes: {
        userId: user.id,
        username: user.username,
        plan: VIP_CONFIG.PLAN_CODE,
      },
    });

    if (!order || !order.id) {
      return NextResponse.json({ error: 'Failed to create payment order with Razorpay' }, { status: 500 });
    }

    console.log(`[PAYMENT] Order created successfully: ${order.id} for user ${user.id} (${user.username})`);

    // 5. Log payment record in database
    await prisma.payment.create({
      data: {
        userId: user.id,
        razorpayOrderId: order.id,
        amount,
        currency,
        plan: 'VIP',
        status: 'CREATED',
      },
    });

    return NextResponse.json({
      orderId: order.id,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      priceInr: VIP_CONFIG.PRICE_INR,
    });
  } catch (error: any) {
    console.error('[PAYMENT] Create Order Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create Razorpay payment order' },
      { status: 500 }
    );
  }
}
