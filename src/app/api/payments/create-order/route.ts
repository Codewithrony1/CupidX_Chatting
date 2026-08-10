import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import Razorpay from 'razorpay';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const amount = body.amount || 2900; // Amount in paise (default ₹29 = 2900 paise)
    const currency = body.currency || 'INR';

    // Minimum amount requirement (100 paise = ₹1)
    if (typeof amount !== 'number' || amount < 100) {
      return NextResponse.json(
        { error: 'Invalid payment amount. Minimum required is 100 paise.' },
        { status: 400 }
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error('Razorpay environment variables missing');
      return NextResponse.json({ error: 'Razorpay payment gateway not configured' }, { status: 500 });
    }

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
        plan: 'VIP',
      },
    });

    if (!order || !order.id) {
      return NextResponse.json({ error: 'Failed to create order with Razorpay' }, { status: 500 });
    }

    // Save payment record with status 'CREATED'
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
      order_id: order.id,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    });
  } catch (error: any) {
    console.error('Razorpay Create Order Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create Razorpay payment order' },
      { status: 500 }
    );
  }
}
