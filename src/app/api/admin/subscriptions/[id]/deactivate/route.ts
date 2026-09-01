import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getCurrentUser(req);
    const sessionAuth = await auth().catch(() => null);
    const claims = sessionAuth?.sessionClaims as any;
    const clerkRole = claims?.metadata?.role || claims?.role || claims?.publicMetadata?.role;

    const isLocalAdminMode = process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production';
    const isAdmin = isLocalAdminMode || admin?.role === 'ADMIN' || clerkRole === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { id } = await props.params;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id }, { clerkUserId: id }],
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

    if (admin?.id) {
      await prisma.adminLog.create({
        data: {
          adminUserId: admin.id,
          adminClerkId: claims?.sub || null,
          action: 'SUBSCRIPTION_DEACTIVATED',
          targetUserId: user.id,
          entityType: 'SUBSCRIPTION',
          entityId: subscription.id,
          details: `Manually deactivated subscription for @${user.username}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Subscription deactivated for @${user.username}.`,
      subscription,
    });
  } catch (error) {
    console.error('Error deactivating subscription:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
