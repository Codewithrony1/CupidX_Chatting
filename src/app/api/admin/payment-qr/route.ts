import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    const admin = await getCurrentUser(req);
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      region = 'india',
      qrImageData,
      upiId,
      indiaPriceMonthly,
      indiaPriceYearly,
      intlPriceMonthly,
      intlPriceYearly,
    } = body;

    const settingKey = region === 'international' ? 'paymentQrUrlInternational' : 'paymentQrUrlIndia';
    let savedQrUrl = null;

    if (qrImageData && qrImageData.startsWith('data:image/')) {
      const matches = qrImageData.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `payment-qr-${region}-${Date.now()}.${ext}`;

        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'qr');
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(path.join(uploadDir, filename), buffer);

        savedQrUrl = `/uploads/qr/${filename}`;

        await prisma.appSetting.upsert({
          where: { key: settingKey },
          update: { value: savedQrUrl },
          create: { key: settingKey, value: savedQrUrl },
        });
      }
    }

    if (upiId) {
      await prisma.appSetting.upsert({
        where: { key: 'merchantUpiId' },
        update: { value: upiId.trim() },
        create: { key: 'merchantUpiId', value: upiId.trim() },
      });
    }

    // Optional pricing overrides
    if (indiaPriceMonthly) {
      await prisma.appSetting.upsert({
        where: { key: 'indiaPriceMonthly' },
        update: { value: indiaPriceMonthly.toString() },
        create: { key: 'indiaPriceMonthly', value: indiaPriceMonthly.toString() },
      });
    }
    if (indiaPriceYearly) {
      await prisma.appSetting.upsert({
        where: { key: 'indiaPriceYearly' },
        update: { value: indiaPriceYearly.toString() },
        create: { key: 'indiaPriceYearly', value: indiaPriceYearly.toString() },
      });
    }
    if (intlPriceMonthly) {
      await prisma.appSetting.upsert({
        where: { key: 'intlPriceMonthly' },
        update: { value: intlPriceMonthly.toString() },
        create: { key: 'intlPriceMonthly', value: intlPriceMonthly.toString() },
      });
    }
    if (intlPriceYearly) {
      await prisma.appSetting.upsert({
        where: { key: 'intlPriceYearly' },
        update: { value: intlPriceYearly.toString() },
        create: { key: 'intlPriceYearly', value: intlPriceYearly.toString() },
      });
    }

    // Log admin action
    await prisma.adminLog.create({
      data: {
        adminUserId: admin.id,
        action: 'UPDATE_PAYMENT_QR',
        details: `Updated ${region} payment QR to ${savedQrUrl || 'unchanged'}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${region === 'international' ? 'International' : 'Indian'} Payment QR updated successfully.`,
      savedQrUrl,
    });
  } catch (error) {
    console.error('Error updating payment QR:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
