import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const settings = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            'paymentQrUrlIndia',
            'paymentQrUrlIndiaMonthly',
            'paymentQrUrlIndiaYearly',
            'paymentQrUrlInternational',
            'merchantUpiId',
            'indiaPriceMonthly',
            'indiaPriceYearly',
            'intlPriceMonthly',
            'intlPriceYearly',
          ],
        },
      },
    });

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const paymentQrUrlIndiaMonthly = settingsMap.get('paymentQrUrlIndiaMonthly') || settingsMap.get('paymentQrUrlIndia') || '/uploads/qr/payment-qr-india.jpg';
    const paymentQrUrlIndiaYearly = settingsMap.get('paymentQrUrlIndiaYearly') || '/uploads/qr/payment-qr-india-199.jpg';
    const paymentQrUrlIndia = paymentQrUrlIndiaMonthly;
    const paymentQrUrlInternational = settingsMap.get('paymentQrUrlInternational') || '/lexino-qr.jpg';
    const merchantUpiId = settingsMap.get('merchantUpiId') || process.env.MERCHANT_UPI_ID || 'cupidxchat@upi';

    const indiaPriceMonthly = parseFloat(settingsMap.get('indiaPriceMonthly') || '29');
    const indiaPriceYearly = parseFloat(settingsMap.get('indiaPriceYearly') || '199');
    const intlPriceMonthly = parseFloat(settingsMap.get('intlPriceMonthly') || '2');
    const intlPriceYearly = parseFloat(settingsMap.get('intlPriceYearly') || '12');

    return NextResponse.json({
      success: true,
      paymentQrUrlIndia,
      paymentQrUrlIndiaMonthly,
      paymentQrUrlIndiaYearly,
      paymentQrUrlInternational,
      merchantUpiId,
      merchantName: 'Lexino Enterprises',
      pricing: {
        india: {
          currency: 'INR',
          symbol: '₹',
          monthly: indiaPriceMonthly,
          yearly: indiaPriceYearly,
          qrMonthly: paymentQrUrlIndiaMonthly,
          qrYearly: paymentQrUrlIndiaYearly,
        },
        international: {
          currency: 'USD',
          symbol: '$',
          monthly: intlPriceMonthly,
          yearly: intlPriceYearly,
          qrMonthly: paymentQrUrlInternational,
          qrYearly: paymentQrUrlInternational,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching payment QR settings:', error);
    return NextResponse.json({
      success: true,
      paymentQrUrlIndia: '/uploads/qr/payment-qr-india.jpg',
      paymentQrUrlIndiaMonthly: '/uploads/qr/payment-qr-india.jpg',
      paymentQrUrlIndiaYearly: '/uploads/qr/payment-qr-india-199.jpg',
      paymentQrUrlInternational: '/lexino-qr.jpg',
      merchantUpiId: 'cupidxchat@upi',
      merchantName: 'Lexino Enterprises',
      pricing: {
        india: {
          currency: 'INR',
          symbol: '₹',
          monthly: 29,
          yearly: 199,
          qrMonthly: '/uploads/qr/payment-qr-india.jpg',
          qrYearly: '/uploads/qr/payment-qr-india-199.jpg',
        },
        international: {
          currency: 'USD',
          symbol: '$',
          monthly: 2,
          yearly: 12,
          qrMonthly: '/lexino-qr.jpg',
          qrYearly: '/lexino-qr.jpg',
        },
      },
    });
  }
}
