import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VIP_CONFIG } from '@/lib/config';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    // 1. Verify Webhook HMAC-SHA256 Signature
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.error('[PAYMENT WEBHOOK] Invalid signature match');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.event_id || payload.id || `evt_${Date.now()}`;
    const eventType = payload.event || 'payment.captured';

    console.log(`[PAYMENT WEBHOOK] Received event: ${eventType} (ID: ${eventId})`);

    // 2. Idempotency Check: Prevent duplicate event processing
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });

    if (existingEvent) {
      console.log(`[PAYMENT WEBHOOK] Event ${eventId} already processed, skipping.`);
      return NextResponse.json({ status: 'already_processed' }, { status: 200 });
    }

    // Record webhook event ID
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType,
      },
    });

    // Extract payment/order details
    const paymentEntity = payload.payload?.payment?.entity || payload.payload?.order?.entity;
    const razorpayOrderId = paymentEntity?.order_id || paymentEntity?.id;
    const razorpayPaymentId = paymentEntity?.id;

    // 3. Handle Payment Captured / Order Paid / Subscription Charged Events
    if (eventType === 'order.paid' || eventType === 'payment.captured' || eventType === 'subscription.charged') {
      if (razorpayOrderId) {
        const payment = await prisma.payment.findFirst({
          where: { razorpayOrderId },
        });

        if (payment) {
          // Update Payment -> CAPTURED
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId,
              status: 'CAPTURED',
            },
          });

          // Upgrade User -> VIP
          await prisma.user.update({
            where: { id: payment.userId },
            data: { membershipTier: 'VIP' },
          });

          const now = new Date();
          const periodEnd = new Date(Date.now() + VIP_CONFIG.DURATION_DAYS * 24 * 60 * 60 * 1000);

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

          console.log(`[PAYMENT WEBHOOK] Successfully activated VIP for user ${payment.userId}`);
        }
      }
    }

    // 4. Handle Payment Failed Event
    if (eventType === 'payment.failed') {
      if (razorpayOrderId) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId },
          data: { status: 'FAILED' },
        });
        console.log(`[PAYMENT WEBHOOK] Payment failed logged for order ${razorpayOrderId}`);
      }
    }

    // 5. Handle Refund Event
    if (eventType === 'refund.processed') {
      if (razorpayPaymentId) {
        const payment = await prisma.payment.findFirst({
          where: { razorpayPaymentId },
        });

        if (payment) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'REFUNDED' },
          });

          await prisma.user.update({
            where: { id: payment.userId },
            data: { membershipTier: 'FREE' },
          });

          await prisma.subscription.updateMany({
            where: { userId: payment.userId },
            data: { isActive: false, subscriptionStatus: 'REFUNDED' },
          });

          console.log(`[PAYMENT WEBHOOK] Refund processed & VIP reverted for user ${payment.userId}`);
        }
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error: any) {
    console.error('[PAYMENT WEBHOOK] Error processing event:', error);
    return NextResponse.json({ error: 'Internal Webhook Error' }, { status: 500 });
  }
}
