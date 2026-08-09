import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, isMock } = body;

    if (!razorpayOrderId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (isMock) {
      const payment = await prisma.payment.findUnique({
        where: { razorpayOrderId },
      });

      if (!payment) {
        return NextResponse.json({ error: 'Payment order not found' }, { status: 404 });
      }

      await prisma.payment.update({
        where: { razorpayOrderId },
        data: {
          razorpayPaymentId: razorpayPaymentId || `pay_mock_${Date.now()}`,
          status: 'SUCCESS',
        }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { membershipTier: 'VIP' },
      });

      await prisma.subscription.upsert({
        where: { userId: user.id },
        update: {
          plan: 'VIP',
          isActive: true,
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year VIP
        },
        create: {
          userId: user.id,
          plan: 'VIP',
          isActive: true,
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        }
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          type: 'PAYMENT',
          content: 'Congratulations! You are now a CupidX VIP Member.',
        }
      });

      return NextResponse.json({
        message: 'Mock payment verified and VIP subscription activated.',
        success: true,
      });
    }

    if (!razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ error: 'Missing payment proof' }, { status: 400 });
    }

    const text = `${razorpayOrderId}|${razorpayPaymentId}`;
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(text)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      await prisma.payment.update({
        where: { razorpayOrderId },
        data: { status: 'FAILED' }
      });
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    await prisma.payment.update({
      where: { razorpayOrderId },
      data: {
        razorpayPaymentId,
        status: 'SUCCESS',
      }
    });

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        plan: 'VIP',
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
      create: {
        userId: user.id,
        plan: 'VIP',
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: 'PAYMENT',
        content: 'Your payment was successful. CupidX VIP membership activated!',
      }
    });

    return NextResponse.json({
      message: 'Payment verified successfully. VIP membership activated.',
      success: true,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
