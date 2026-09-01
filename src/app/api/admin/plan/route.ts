import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function POST(req: Request) {
  try {
    const { authorized, user, adminFirebaseUid } = await verifyAdminAccess(req);

    if (!authorized) {
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
    const adminIdentifier = user?.username || adminFirebaseUid || 'admin';

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

      await prisma.notification.create({
        data: {
          userId,
          type: 'VIP_UPGRADED',
          content: `👑 VIP Granted! Your account was upgraded to VIP by Admin for ${grantDays} days (expires ${expiresAt.toLocaleDateString()}).`,
        },
      });

      await prisma.adminLog.create({
        data: {
          adminUserId: user?.id || 'admin',
          adminFirebaseUid: adminFirebaseUid || null,
          action: 'GRANT_VIP',
          targetUserId: userId,
          entityType: 'SUBSCRIPTION',
          entityId: userId,
          details: `Admin ${adminIdentifier} manually granted VIP to @${targetUser.username} (${grantDays} days, expires ${expiresAt.toISOString()})`,
        },
      });

      return NextResponse.json({
        success: true,
        message: `VIP successfully granted to ${targetUser.username} for ${grantDays} days.`,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          membershipTier: updatedUser.membershipTier,
          vip_expires_at: updatedUser.vip_expires_at,
        },
      });
    }

    if (action === 'revoke') {
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

      await prisma.notification.create({
        data: {
          userId,
          type: 'VIP_REVOKED',
          content: '⚠️ VIP Status Changed: Your VIP subscription has been revoked by administration.',
        },
      });

      await prisma.adminLog.create({
        data: {
          adminUserId: user?.id || 'admin',
          adminFirebaseUid: adminFirebaseUid || null,
          action: 'REVOKE_VIP',
          targetUserId: userId,
          entityType: 'SUBSCRIPTION',
          entityId: userId,
          details: `Admin ${adminIdentifier} manually revoked VIP from @${targetUser.username}`,
        },
      });

      return NextResponse.json({
        success: true,
        message: `VIP revoked from ${targetUser.username}.`,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          membershipTier: updatedUser.membershipTier,
        },
      });
    }
  } catch (error) {
    console.error('Admin plan modification error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
