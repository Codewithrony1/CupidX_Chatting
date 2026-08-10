import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.error('Invalid Razorpay Webhook signature');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.event_id || payload.id || `evt_${Date.now()}`;
    const eventType = payload.event || 'payment.captured';

    // Idempotency Check: Prevent duplicate event processing
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });

    if (existingEvent) {
      return NextResponse.json({ status: 'already_processed' }, { status: 200 });
    }

    // Record webhook event ID for idempotency
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType,
      },
    });

    // Handle payment success events (order.paid, payment.captured, subscription.charged)
    if (eventType === 'order.paid' || eventType === 'payment.captured' || eventType === 'subscription.charged') {
      const paymentEntity = payload.payload?.payment?.entity || payload.payload?.order?.entity;
      const razorpayOrderId = paymentEntity?.order_id || paymentEntity?.id;
      const razorpayPaymentId = paymentEntity?.id;

      if (razorpayOrderId) {
        const payment = await prisma.payment.findFirst({
          where: { razorpayOrderId },
        });

        if (payment) {
          // Update payment status to SUCCESS
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId,
              status: 'SUCCESS',
            },
          });

          // Upgrade user to VIP
          await prisma.user.update({
            where: { id: payment.userId },
            data: { membershipTier: 'VIP' },
          });

          const now = new Date();
          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          await prisma.subscription.upsert({
            where: { userId: payment.userId },
            update: {
              plan: 'VIP',
              isActive: true,
              subscriptionStatus: 'ACTIVE',
              razorpayOrderId,
              razorpayPaymentId: razorpayPaymentId || undefined,
              startDate: now,
              endDate: periodEnd,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
            create: {
              userId: payment.userId,
              plan: 'VIP',
              isActive: true,
              subscriptionStatus: 'ACTIVE',
              razorpayOrderId,
              razorpayPaymentId: razorpayPaymentId || undefined,
              startDate: now,
              endDate: periodEnd,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
            },
          });

          await prisma.notification.create({
            data: {
              userId: payment.userId,
              type: 'PAYMENT',
              content: '🎉 Webhook Confirmed! Your CupidX VIP Membership is active.',
            },
          });
        }
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error: any) {
    console.error('Razorpay Webhook Processing Error:', error);
    return NextResponse.json({ error: 'Internal Webhook Error' }, { status: 500 });
  }
}
