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
    const { userId, isSuspended } = body;

    if (!userId || typeof isSuspended !== 'boolean') {
      return NextResponse.json({ error: 'Valid userId and isSuspended boolean required.' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isSuspended },
    });

    if (user?.id) {
      await prisma.adminLog.create({
        data: {
          adminUserId: user.id,
          action: isSuspended ? 'BAN_USER' : 'UNBAN_USER',
          targetUserId: userId,
          details: `${isSuspended ? 'Suspended' : 'Unbanned'} user @${targetUser.username}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `User @${targetUser.username} is now ${isSuspended ? 'banned' : 'active'}.`,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error toggling user suspension:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
