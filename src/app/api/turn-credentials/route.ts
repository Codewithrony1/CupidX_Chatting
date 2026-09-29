import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // 1. Verify user JWT strictly
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Check VIP eligibility server-side
    const now = Date.now();
    let isVIP = false;

    // Check expiration if vip_expires_at is set
    let isExpired = false;
    if (user.vip_expires_at) {
      const exp = new Date(user.vip_expires_at).getTime();
      if (!isNaN(exp) && exp <= now) {
        isExpired = true;
      }
    }

    if (!isExpired) {
      // Direct user tier check
      if (user.is_vip || user.membershipTier === 'VIP') {
        isVIP = true;
      }

      // Subscription check
      const sub = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      if (sub && sub.isActive && sub.plan === 'VIP') {
        const subEnd = sub.endDate || sub.currentPeriodEnd;
        const subExp = subEnd ? new Date(subEnd).getTime() : 0;
        if (!subEnd || (!isNaN(subExp) && subExp > now)) {
          isVIP = true;
        }
      }
    }

    if (!isVIP) {
      return NextResponse.json(
        { error: 'VIP membership required for voice and video calls', code: 'VIP_REQUIRED' },
        { status: 403 }
      );
    }

    // 3. Fetch TURN relay credentials from Metered
    const appName = process.env.METERED_APP_NAME?.trim();
    const apiKey = process.env.METERED_API_KEY?.trim();

    if (!appName || !apiKey) {
      console.warn('[TURN] METERED_APP_NAME or METERED_API_KEY is not configured. Falling back to public STUN.');
      return NextResponse.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
        provider: 'fallback_stun',
      });
    }

    const meteredUrl = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`;
    const meteredRes = await fetch(meteredUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!meteredRes.ok) {
      const errText = await meteredRes.text().catch(() => '');
      console.error('[TURN] Metered API request failed:', meteredRes.status, errText);
      return NextResponse.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
        provider: 'fallback_stun',
      });
    }

    const data = await meteredRes.json();
    const iceServers = Array.isArray(data) ? data : data.iceServers || [];

    return NextResponse.json({
      iceServers,
      provider: 'metered',
    });
  } catch (err: any) {
    console.error('[TURN] Error obtaining TURN credentials:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
