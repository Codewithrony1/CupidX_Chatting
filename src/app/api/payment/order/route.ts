import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import Razorpay from 'razorpay';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const amount = 2900; // ₹29 in paise (29 * 100)

    const isMock = !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('mock');

    if (isMock) {
      const mockOrderId = `order_mock_${Date.now()}`;
      
      await prisma.payment.create({
        data: {
          userId: user.id,
          razorpayOrderId: mockOrderId,
          amount,
          status: 'PENDING',
        }
      });

      return NextResponse.json({
        isMock: true,
        orderId: mockOrderId,
        amount,
        currency: 'INR',
        keyId: 'mock_key'
      });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `receipt_${user.username}_${Date.now()}`,
    });

    await prisma.payment.create({
      data: {
        userId: user.id,
        razorpayOrderId: order.id,
        amount,
        status: 'PENDING',
      }
    });

    return NextResponse.json({
      isMock: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error: any) {
    console.error('Order creation error:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
