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
        membershipTier: 'FREE',
        is_vip: false,
        vip_expires_at: null,
      },
    });

    const subscription = await prisma.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        plan: 'FREE',
        isActive: false,
        subscriptionStatus: 'CANCELLED',
      },
      update: {
        plan: 'FREE',
        isActive: false,
        subscriptionStatus: 'CANCELLED',
      },
    });

    await prisma.adminLog.create({
      data: {
        adminUserId: admin?.id || 'admin',
        adminFirebaseUid: adminFirebaseUid || null,
        action: 'DEACTIVATE_SUBSCRIPTION',
        targetUserId: user.id,
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        details: `Deactivated VIP subscription for ${user.username}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Deactivated VIP subscription for ${user.username}`,
      subscription,
    });
  } catch (error) {
    console.error('Error deactivating subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
