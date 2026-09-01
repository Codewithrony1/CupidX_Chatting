import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { plan = 'monthly', region, paymentId, screenshot } = body;

    // 1. Validate Region (Required)
    if (!region || !['india', 'international'].includes(region.toLowerCase())) {
      return NextResponse.json(
        { error: 'Payment region is required and must be either "india" or "international".' },
        { status: 400 }
      );
    }

    const selectedRegion = region.toLowerCase() as 'india' | 'international';
    const cleanPaymentId = (paymentId || '').trim();
    const hasScreenshot = Boolean(screenshot && screenshot.startsWith('data:image/'));

    // 2. Require at least ONE of paymentId or screenshot
    if (!cleanPaymentId && !hasScreenshot) {
      return NextResponse.json(
        { error: 'Please enter a Payment / Transaction ID or upload a payment screenshot.' },
        { status: 400 }
      );
    }

    // 3. Block duplicate pending requests
    const existingPending = await prisma.paymentRequest.findFirst({
      where: {
        userId: user.id,
        status: 'pending',
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

    // 4. Save Screenshot proof if provided
    let screenshotUrl: string | null = null;
    if (hasScreenshot) {
      const matches = screenshot.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        if (buffer.length > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'Screenshot file size exceeds 5MB limit.' }, { status: 400 });
        }

        const filename = `receipt-${selectedRegion}-${user.username}-${Date.now()}.${ext}`;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'receipts');
        await fs.mkdir(uploadDir, { recursive: true });

        await fs.writeFile(path.join(uploadDir, filename), buffer);
        screenshotUrl = `/uploads/receipts/${filename}`;
      }
    }

    const planCode = plan === 'yearly' ? 'yearly' : 'monthly';
    const currency = selectedRegion === 'india' ? 'INR' : 'USD';
    const amount = selectedRegion === 'india' ? (planCode === 'yearly' ? 199.0 : 29.0) : (planCode === 'yearly' ? 12.0 : 2.0);
    const requestId = `REQ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 5. Create PaymentRequest record
    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        requestId,
        userId: user.id,
        username: user.username,
        plan: planCode,
        region: selectedRegion,
        amount,
        currency,
        paymentId: cleanPaymentId || null,
        screenshotUrl,
        status: 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment proof submitted successfully. Your request is now pending admin review.',
      request: paymentRequest,
    });
  } catch (error) {
    console.error('Error creating payment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
