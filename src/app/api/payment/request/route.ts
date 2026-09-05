import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    // 1. Authenticate user server-side via Clerk / Session
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const clerkEmail: string | null = user.email || null;
    const clerkName: string | null = user.fullName || user.displayName || user.username;
    const clerkId: string = user.clerkUserId || user.id;

    const body = await req.json().catch(() => ({}));
    const { plan = 'monthly', region = 'india', paymentId, screenshot, utrNumber } = body;

    const effectivePaymentId = (paymentId || utrNumber || '').trim();
    const hasScreenshot = Boolean(screenshot && screenshot.startsWith('data:image/'));

    // 2. Validation: Require at least UTR or Screenshot
    if (!effectivePaymentId && !hasScreenshot) {
      return NextResponse.json(
        { error: 'Please enter a valid Payment / UTR reference number or upload a payment screenshot.' },
        { status: 400 }
      );
    }

    // 3. Duplicate UTR Protection (Requirement 16)
    if (effectivePaymentId) {
      const cleanUtr = effectivePaymentId.replace(/\s+/g, '').toUpperCase();
      const existingUtr = await prisma.paymentRequest.findFirst({
        where: {
          paymentId: cleanUtr,
          status: { in: ['pending', 'UNDER_REVIEW', 'approved', 'APPROVED'] },
        },
      });

      if (existingUtr) {
        return NextResponse.json(
          { error: 'This transaction reference / UTR has already been submitted.' },
          { status: 409 }
        );
      }
    }

    // 4. Block multiple active pending requests for the same user
    const existingPending = await prisma.paymentRequest.findFirst({
      where: {
        userId: user.id,
        status: { in: ['pending', 'UNDER_REVIEW'] },
      },
    });

    if (existingPending) {
      return NextResponse.json(
        {
          error: 'You already have a payment request under review. Please wait for admin verification.',
          hasPending: true,
          request: existingPending,
        },
        { status: 409 }
      );
    }

    // 5. Screenshot Processing (Secure MIME & Magic Bytes Validation)
    let screenshotUrl: string | null = null;
    let screenshotKey: string | null = null;

    if (hasScreenshot) {
      const matches = screenshot.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const rawExt = matches[1].toLowerCase();
        const ext = rawExt === 'jpeg' ? 'jpg' : (rawExt === 'png' ? 'png' : (rawExt === 'webp' ? 'webp' : 'jpg'));
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        if (buffer.length > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'Screenshot file size exceeds 5MB limit.' }, { status: 400 });
        }

        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
        const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;

        if (!isPng && !isJpg && !isWebp) {
          return NextResponse.json({ error: 'Invalid image file format. Only JPG, PNG, and WebP are allowed.' }, { status: 400 });
        }

        const randomKey = crypto.randomBytes(16).toString('hex');
        const filename = `cpx_ss_${Date.now()}_${randomKey}.${ext}`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'receipts');
        await fs.mkdir(uploadDir, { recursive: true });

        await fs.writeFile(path.join(uploadDir, filename), buffer);
        screenshotUrl = `/uploads/receipts/${filename}`;
        screenshotKey = filename;
      }
    }

    // 6. Plan & Pricing Configuration
    const normalizedPlan = (plan || 'monthly').toLowerCase();
    let durationDays = 30;
    let amount = 99.0;
    let planId = 'premium_monthly';

    if (normalizedPlan === 'weekly' || normalizedPlan === '7days') {
      durationDays = 7;
      amount = 29.0;
      planId = 'premium_weekly';
    } else if (normalizedPlan === 'yearly' || normalizedPlan === '365days' || normalizedPlan === 'pro_yearly') {
      durationDays = 365;
      amount = 499.0;
      planId = 'premium_yearly';
    } else {
      durationDays = 30;
      amount = 99.0;
      planId = 'premium_monthly';
    }

    // Check if custom price setting is configured in database
    try {
      const settingKey = normalizedPlan === 'weekly' ? 'priceWeekly' : (normalizedPlan === 'yearly' ? 'priceYearly' : 'priceMonthly');
      const customPrice = await prisma.appSetting.findUnique({ where: { key: settingKey } });
      if (customPrice && !isNaN(parseFloat(customPrice.value))) {
        amount = parseFloat(customPrice.value);
      }
    } catch (e) {}

    // 7. Generate Request ID
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const requestId = `CPX-${dateStr}-${randomHex}`;

    // 8. Create PaymentRequest in database
    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        requestId,
        userId: user.id,
        clerkUserId: clerkId,
        userEmail: clerkEmail,
        userFullName: clerkName,
        username: user.username,
        plan: normalizedPlan,
        planId,
        region: region || 'india',
        amount,
        currency: 'INR',
        paymentId: effectivePaymentId || null,
        screenshotUrl,
        screenshotKey,
        status: 'UNDER_REVIEW',
      },
    });

    // 9. Write Audit Log
    try {
      await prisma.adminLog.create({
        data: {
          adminUserId: user.id,
          adminClerkId: clerkId,
          action: 'PAYMENT_PROOF_SUBMITTED',
          targetUserId: user.id,
          entityType: 'PAYMENT',
          entityId: paymentRequest.id,
          details: `User @${user.username} (Clerk ID: ${clerkId}) submitted payment proof for ${normalizedPlan} (₹${amount}). UTR: ${effectivePaymentId || 'None'}. ID: ${requestId}`,
        },
      });
    } catch (e) {}

    return NextResponse.json({
      success: true,
      message: 'Payment proof submitted. Your payment is now under review by administration.',
      request: paymentRequest,
    });
  } catch (error) {
    console.error('Error submitting payment proof:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
