import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VIP_PLANS, VIP_CONFIG } from '@/lib/config';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;

    // 1. Verify Webhook HMAC-SHA256 Signature (Strict security verification)
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.error('[PAYMENT WEBHOOK] Invalid signature match');
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
      }
    } else if (process.env.NODE_ENV === 'production' && !signature) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const eventId = payload.event_id || payload.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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

    // Record webhook event ID in database
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType,
      },
    });

    // Extract payment / order entity
    const paymentEntity = payload.payload?.payment?.entity || payload.payload?.order?.entity || payload.payload?.qr_code?.entity;
    const razorpayOrderId = paymentEntity?.order_id || paymentEntity?.id || payload.payload?.order?.entity?.id;
    const razorpayPaymentId = payload.payload?.payment?.entity?.id || paymentEntity?.id;

    // 3. Handle Payment Captured / Order Paid / QR Credited Events
    const isPaymentSuccessEvent =
      eventType === 'order.paid' ||
      eventType === 'payment.captured' ||
      eventType === 'qr_code.credited' ||
      eventType === 'subscription.charged';

    if (isPaymentSuccessEvent && razorpayOrderId) {
      // Find matching payment record
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { razorpayOrderId },
            { id: razorpayOrderId },
          ],
        },
      });

      if (payment) {
        // Idempotency: check if this payment was already credited
        if (payment.status === 'CAPTURED' || payment.status === 'PAID') {
          console.log(`[PAYMENT WEBHOOK] Payment for order ${payment.razorpayOrderId} already confirmed as PAID.`);
          return NextResponse.json({ status: 'already_paid' }, { status: 200 });
        }

        // Calculate VIP Duration
        const planConfig = VIP_PLANS[payment.plan] || VIP_CONFIG;
        const durationDays = planConfig.durationDays || 30;

        const now = new Date();
        const periodEnd = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

        // Update Payment -> CAPTURED
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId,
            status: 'CAPTURED',
          },
        });

        // Upgrade User -> VIP and set vip_expires_at
        await prisma.user.update({
          where: { id: payment.userId },
          data: {
            membershipTier: 'VIP',
            is_vip: true,
            vip_started_at: now,
            vip_expires_at: periodEnd,
          },
        });

        // Upsert Subscription
        await prisma.subscription.upsert({
          where: { userId: payment.userId },
          update: {
            plan: payment.plan || 'VIP',
            isActive: true,
            subscriptionStatus: 'ACTIVE',
            razorpayOrderId: payment.razorpayOrderId,
            razorpayPaymentId: razorpayPaymentId || undefined,
            startDate: now,
            endDate: periodEnd,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
          create: {
            userId: payment.userId,
            plan: payment.plan || 'VIP',
            isActive: true,
            subscriptionStatus: 'ACTIVE',
            razorpayOrderId: payment.razorpayOrderId,
            razorpayPaymentId: razorpayPaymentId || undefined,
            startDate: now,
            endDate: periodEnd,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });

        console.log(`[PAYMENT WEBHOOK] Successfully upgraded user ${payment.userId} to VIP for ${durationDays} days.`);
      }
    }

    return NextResponse.json({ status: 'ok', event: eventType }, { status: 200 });
  } catch (error) {
    console.error('[PAYMENT WEBHOOK] Error processing webhook:', error);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}
