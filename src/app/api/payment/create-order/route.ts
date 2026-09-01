import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { VIP_PLANS } from '@/lib/config';
import { checkRateLimit, recordFailedAttempt } from '@/lib/rateLimit';
import Razorpay from 'razorpay';

export async function POST(req: Request) {
  try {
    // 1. Authenticate Logged-in User
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    // 2. Rate-limit create-order requests per user / IP
    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimitKey = `order_create:${user.id}:${clientIp}`;
    const limitCheck = checkRateLimit(rateLimitKey, 10, 60 * 1000); // max 10 order creates per minute
    if (limitCheck.isBlocked) {
      return NextResponse.json(
        { error: `Too many payment requests. Please wait ${limitCheck.retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    // 3. Check if user already has an active VIP membership
    const isVIP = user.is_vip || user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');
    if (isVIP && user.vip_expires_at && new Date(user.vip_expires_at) > new Date()) {
      return NextResponse.json(
        { error: 'VIP membership is already active on your account.', isAlreadyVIP: true },
        { status: 400 }
      );
    }

    // 4. Parse selected plan
    const body = await req.json().catch(() => ({}));
    const planKey = body.plan && VIP_PLANS[body.plan] ? body.plan : 'VIP_MONTHLY';
    const planConfig = VIP_PLANS[planKey];

    const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TNfnCTokMe0Xh0';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret_fallback';

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const receipt = `rcpt_${user.id.substring(0, 8)}_${Date.now()}`;
    const amountInPaise = planConfig.pricePaise;

    // 5. Create Razorpay Order
    let razorpayOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      if (process.env.RAZORPAY_KEY_SECRET) {
        const order = await razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: {
            userId: user.id,
            username: user.username,
            plan: planConfig.code,
          },
        });
        if (order && order.id) {
          razorpayOrderId = order.id;
        }
      }
    } catch (err) {
      console.warn('[PAYMENT] Razorpay order creation fallback to simulated order ID:', err);
    }

    // 6. Dynamic UPI QR Code URL Generation
    // We attempt Razorpay QR Code API, and provide a reliable dynamic UPI QR code
    let qrImageUrl = '';
    let qrCodeId: string | null = null;

    try {
      if (process.env.RAZORPAY_KEY_SECRET && (razorpay as any).qrCode) {
        const qr = await (razorpay as any).qrCode.create({
          type: 'upi_qr',
          name: 'CupidX VIP',
          usage: 'single_use',
          fixed_amount: true,
          payment_amount: amountInPaise,
          description: `CupidX ${planConfig.name}`,
          notes: {
            orderId: razorpayOrderId,
            userId: user.id,
            plan: planConfig.code,
          },
        });

        if (qr && qr.image_url) {
          qrImageUrl = qr.image_url;
          qrCodeId = qr.id;
        }
      }
    } catch (qrErr) {
      console.log('[PAYMENT] Razorpay QR API not enabled or test mode, using dynamic UPI QR:', qrErr);
    }

    // If Razorpay QR API didn't return an image, generate a dynamic UPI QR payload
    if (!qrImageUrl) {
      // Dynamic standard UPI intent string
      const upiId = process.env.MERCHANT_UPI_ID || 'lexino@razorpay';
      const merchantName = encodeURIComponent('CupidX VIP');
      const upiUri = `upi://pay?pa=${upiId}&pn=${merchantName}&am=${planConfig.priceInr}&cu=INR&tn=${encodeURIComponent(`CupidX VIP - ${razorpayOrderId}`)}`;
      qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUri)}&margin=10`;
    }

    // 7. Store order in Payment table
    await prisma.payment.upsert({
      where: { razorpayOrderId },
      create: {
        userId: user.id,
        razorpayOrderId,
        amount: planConfig.priceInr,
        currency: 'INR',
        plan: planConfig.code,
        status: 'CREATED',
        qrImageUrl,
        qrCodeId,
      },
      update: {
        amount: planConfig.priceInr,
        plan: planConfig.code,
        status: 'CREATED',
        qrImageUrl,
        qrCodeId,
      },
    });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10-minute expiry

    return NextResponse.json({
      success: true,
      orderId: razorpayOrderId,
      order_id: razorpayOrderId,
      amount: planConfig.priceInr,
      amountPaise: amountInPaise,
      currency: 'INR',
      plan: planConfig.code,
      planName: planConfig.name,
      qrImageUrl,
      expiresAt,
    });
  } catch (error) {
    console.error('Error creating payment order:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
