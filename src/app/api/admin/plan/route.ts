import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    const sessionAuth = await auth().catch(() => null);
    const claims = sessionAuth?.sessionClaims as any;
    const clerkRole = claims?.metadata?.role || claims?.role || claims?.publicMetadata?.role;

    const isLocalAdminMode = process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production';
    const isAdmin = isLocalAdminMode || user?.role === 'ADMIN' || clerkRole === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { userId, action, days = 30 } = body;

    if (!userId || !['grant', 'revoke'].includes(action)) {
      return NextResponse.json({ error: 'Valid userId and action ("grant" or "revoke") required.' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date();
    const adminIdentifier = user?.username || 'admin';

    if (action === 'grant') {
      const grantDays = parseInt(days.toString(), 10) || 30;
      const expiresAt = new Date(now.getTime() + grantDays * 24 * 60 * 60 * 1000);

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          membershipTier: 'VIP',
          is_vip: true,
          vip_started_at: now,
          vip_expires_at: expiresAt,
        },
      });

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
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

      // Log admin action
      if (user?.id) {
        await prisma.adminLog.create({
          data: {
            adminUserId: user.id,
            action: 'GRANT_VIP',
            targetUserId: userId,
            details: `Manually granted ${grantDays} days VIP access to @${targetUser.username}`,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Granted ${grantDays} days VIP to @${targetUser.username}`,
        user: updatedUser,
      });
    } else {
      // Revoke VIP
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          membershipTier: 'FREE',
          is_vip: false,
          vip_expires_at: null,
        },
      });

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
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

      // Log admin action
      if (user?.id) {
        await prisma.adminLog.create({
          data: {
            adminUserId: user.id,
            action: 'REVOKE_VIP',
            targetUserId: userId,
            details: `Manually revoked VIP access for @${targetUser.username}`,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Revoked VIP from @${targetUser.username}`,
        user: updatedUser,
      });
    }
  } catch (error) {
    console.error('Error updating user VIP plan:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
