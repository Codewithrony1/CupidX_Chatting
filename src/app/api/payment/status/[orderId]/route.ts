import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  req: Request,
  props: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orderId } = await props.params;
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
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
      updatedAt: payment.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
