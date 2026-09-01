import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      // Return latest payment for this user
      const latestPayment = await prisma.payment.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (!latestPayment) {
        return NextResponse.json({ error: 'No payments found' }, { status: 404 });
      }
      const isPaid = latestPayment.status === 'CAPTURED' || latestPayment.status === 'SUCCESS' || latestPayment.status === 'PAID';
      return NextResponse.json({
        success: true,
        orderId: latestPayment.razorpayOrderId,
        status: isPaid ? 'paid' : latestPayment.status.toLowerCase(),
        isPaid,
        plan: latestPayment.plan,
        amount: latestPayment.amount,
      });
    }

    const payment = await prisma.payment.findFirst({
      where: {
        razorpayOrderId: orderId,
        userId: user.id,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const isPaid = payment.status === 'CAPTURED' || payment.status === 'SUCCESS' || payment.status === 'PAID';

    return NextResponse.json({
      success: true,
      orderId: payment.razorpayOrderId,
      status: isPaid ? 'paid' : payment.status.toLowerCase(),
      isPaid,
      plan: payment.plan,
      amount: payment.amount,
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
