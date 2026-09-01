import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    // 1. Authenticate user server-side
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const clerkEmail: string | null = user.email || null;
    const clerkName: string | null = user.fullName || user.displayName || user.username;
    const clerkId: string | null = user.firebaseUid || user.clerkUserId || user.id;

    const body = await req.json().catch(() => ({}));
    const { plan = 'monthly', region, paymentId, screenshot } = body;

    // 2. Validate Region (Required: "india" | "international")
    if (!region || !['india', 'international'].includes(region.toLowerCase())) {
      return NextResponse.json(
        { error: 'Payment region is required and must be either "india" or "international".' },
        { status: 400 }
      );
    }

    const selectedRegion = region.toLowerCase() as 'india' | 'international';
    const cleanPaymentId = (paymentId || '').trim();
    const hasScreenshot = Boolean(screenshot && screenshot.startsWith('data:image/'));

    // 3. Validation: Require at least ONE of paymentId or screenshot
    if (!cleanPaymentId && !hasScreenshot) {
      return NextResponse.json(
        { error: 'Please enter a Payment / UTR ID or upload a payment screenshot.' },
        { status: 400 }
      );
    }

    // 4. Block duplicate pending requests
    const existingPending = await prisma.paymentRequest.findFirst({
      where: {
        userId: user.id,
        status: { in: ['pending', 'UNDER_REVIEW'] },
      },
    });

    if (existingPending) {
      return NextResponse.json(
        {
          error: 'You already have a pending payment request under review. Please wait for admin approval.',
          hasPending: true,
          request: existingPending,
        },
        { status: 409 }
      );
    }

    // 5. Secure Screenshot Processing (Validate MIME, generate secure random filename)
    let screenshotUrl: string | null = null;
    let screenshotKey: string | null = null;

    if (hasScreenshot) {
      const matches = screenshot.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const rawExt = matches[1].toLowerCase();
        const ext = rawExt === 'jpeg' ? 'jpg' : (rawExt === 'png' ? 'png' : (rawExt === 'webp' ? 'webp' : 'jpg'));
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        // File size limit: 5MB
        if (buffer.length > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'Screenshot file size exceeds 5MB limit.' }, { status: 400 });
        }

        // Validate Magic Bytes (PNG: 89 50 4E 47, JPEG: FF D8 FF, WEBP: 52 49 46 46)
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

    // 6. Get Server-Configured Pricing (NEVER trust client-provided amounts)
    const isYearly = plan === 'yearly' || plan === 'pro_yearly';
    const planCode = isYearly ? 'yearly' : 'monthly';
    const planId = isYearly ? 'pro_yearly' : 'pro_monthly';

    // Retrieve settings or standard pricing
    let amount = selectedRegion === 'india' ? (isYearly ? 199.0 : 29.0) : (isYearly ? 12.0 : 2.0);
    const currency = selectedRegion === 'india' ? 'INR' : 'USD';

    try {
      const priceSettingKey = selectedRegion === 'india'
        ? (isYearly ? 'indiaPriceYearly' : 'indiaPriceMonthly')
        : (isYearly ? 'intlPriceYearly' : 'intlPriceMonthly');
      const priceSetting = await prisma.appSetting.findUnique({ where: { key: priceSettingKey } });
      if (priceSetting && !isNaN(parseFloat(priceSetting.value))) {
        amount = parseFloat(priceSetting.value);
      }
    } catch (e) {}

    // 7. Generate CPX Unique Payment Request ID (e.g. CPX-20260901-A82F91)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const requestId = `CPX-${dateStr}-${randomHex}`;

    // 8. Create PaymentRequest record in Database
    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        requestId,
        userId: user.id,
        clerkUserId: clerkId,
        userEmail: clerkEmail,
        userFullName: clerkName,
        username: user.username,
        plan: planCode,
        planId,
        region: selectedRegion,
        amount,
        currency,
        paymentId: cleanPaymentId || null,
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
          details: `User @${user.username} (${clerkEmail || 'no email'}) submitted payment proof for ${planCode} (₹${amount}). Payment ID: ${requestId}`,
        },
      });
    } catch (e) {}

    return NextResponse.json({
      success: true,
      message: 'Payment proof submitted. Our team will manually verify your payment.',
      request: paymentRequest,
    });
  } catch (error) {
    console.error('Error submitting payment proof:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
