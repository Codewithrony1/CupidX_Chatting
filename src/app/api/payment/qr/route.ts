import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const settings = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            'paymentQrUrlIndia',
            'paymentQrUrlIndiaWeekly',
            'paymentQrUrlIndiaMonthly',
            'paymentQrUrlIndiaYearly',
            'paymentQrUrlInternational',
            'merchantUpiId',
            'merchantName',
            'indiaPriceWeekly',
            'indiaPriceMonthly',
            'indiaPriceYearly',
            'intlPriceMonthly',
            'intlPriceYearly',
          ],
        },
      },
    });

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const paymentQrUrlIndia = settingsMap.get('paymentQrUrlIndia') || '/uploads/qr/payment-qr-india.jpg';
    const paymentQrUrlIndiaWeekly = settingsMap.get('paymentQrUrlIndiaWeekly') || paymentQrUrlIndia;
    const paymentQrUrlIndiaMonthly = settingsMap.get('paymentQrUrlIndiaMonthly') || paymentQrUrlIndia;
    const paymentQrUrlIndiaYearly = settingsMap.get('paymentQrUrlIndiaYearly') || '/uploads/qr/payment-qr-india-199.jpg';
    const paymentQrUrlInternational = settingsMap.get('paymentQrUrlInternational') || '/lexino-qr.jpg';
    const merchantUpiId = settingsMap.get('merchantUpiId') || process.env.MERCHANT_UPI_ID || 'cupidxchat@upi';
    const merchantName = settingsMap.get('merchantName') || 'CupidX Chat';

    const indiaPriceMonthly = parseFloat(settingsMap.get('indiaPriceMonthly') || '29');
    const indiaPriceThreeMonths = parseFloat(settingsMap.get('indiaPriceThreeMonths') || '99');
    const indiaPriceYearly = parseFloat(settingsMap.get('indiaPriceYearly') || '399');
    const intlPriceMonthly = parseFloat(settingsMap.get('intlPriceMonthly') || '2');
    const intlPriceYearly = parseFloat(settingsMap.get('intlPriceYearly') || '12');

    // Dynamic UPI links (for tap-to-pay on mobile or generating QR codes)
    const buildUpiUri = (amount: number, plan: string) =>
      `upi://pay?pa=${merchantUpiId}&pn=${encodeURIComponent(merchantName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('CupidX VIP ' + plan)}`;

    return NextResponse.json({
      success: true,
      paymentQrUrlIndia,
      paymentQrUrlIndiaMonthly,
      paymentQrUrlIndiaYearly,
      paymentQrUrlInternational,
      merchantUpiId,
      merchantName,
      pricing: {
        india: {
          currency: 'INR',
          symbol: '₹',
          monthly: indiaPriceMonthly,
          threeMonths: indiaPriceThreeMonths,
          yearly: indiaPriceYearly,
          qrMonthly: paymentQrUrlIndiaMonthly,
          qrThreeMonths: paymentQrUrlIndiaMonthly,
          qrYearly: paymentQrUrlIndiaYearly,
          upiMonthly: buildUpiUri(indiaPriceMonthly, 'Monthly'),
          upiThreeMonths: buildUpiUri(indiaPriceThreeMonths, '3 Months'),
          upiYearly: buildUpiUri(indiaPriceYearly, 'Yearly'),
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
      merchantName: 'CupidX Chat',
      pricing: {
        india: {
          currency: 'INR',
          symbol: '₹',
          monthly: 29,
          threeMonths: 99,
          yearly: 399,
          qrMonthly: '/uploads/qr/payment-qr-india.jpg',
          qrThreeMonths: '/uploads/qr/payment-qr-india.jpg',
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
