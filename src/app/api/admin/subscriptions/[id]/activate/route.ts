import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { authorized, user: admin, adminFirebaseUid } = await verifyAdminAccess(req);

    if (!authorized) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await req.json().catch(() => ({}));
    const days = parseInt((body.days || 30).toString(), 10);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id }, { firebaseUid: id }, { clerkUserId: id }],
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        membershipTier: 'VIP',
        is_vip: true,
        vip_started_at: now,
        vip_expires_at: expiresAt,
      },
    });

    const subscription = await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        plan: 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        startDate: now,
        endDate: expiresAt,
      },
      update: {
        plan: 'VIP',
        isActive: true,
        subscriptionStatus: 'ACTIVE',
        startDate: now,
        endDate: expiresAt,
      },
    });

    await prisma.adminLog.create({
      data: {
        adminUserId: admin?.id || 'admin',
        adminFirebaseUid: adminFirebaseUid || null,
        adminClerkId: admin?.clerkUserId || null,
        action: 'ACTIVATE_SUBSCRIPTION',
        targetUserId: user.id,
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        details: `Activated VIP for ${user.username} (${days} days) until ${expiresAt.toISOString()}`,
      },
    });

    // Sync Firestore
    try {
      const { getAdminDb } = await import('@/lib/firebaseAdmin');
      const db = getAdminDb();
      if (db) {
        const firestoreData = {
          is_vip: true,
          isVIP: true,
          membershipTier: 'VIP',
          vip_expires_at: expiresAt.toISOString(),
          subscription: {
            isActive: true,
            plan: 'VIP',
            endDate: expiresAt.toISOString(),
          },
          updatedAt: now.toISOString(),
        };
        const uids = Array.from(new Set([user.id, user.clerkUserId, user.firebaseUid])).filter(Boolean) as string[];
        await Promise.all(uids.map((u) => db.collection('users').doc(u).set(firestoreData, { merge: true }).catch(() => {})));
      }
    } catch (e) {}

    return NextResponse.json({
      success: true,
      message: `Activated VIP subscription for ${user.username}`,
      subscription,
    });
  } catch (error) {
    console.error('Error activating subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
