import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Permanently delete all associated records
    await prisma.$transaction([
      // Delete user's active/ended chat sessions & messages
      prisma.message.deleteMany({
        where: { senderId: userId },
      }),
      prisma.chatSession.deleteMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
        },
      }),
      // Delete block records
      prisma.block.deleteMany({
        where: {
          OR: [{ blockerId: userId }, { blockedId: userId }],
        },
      }),
      // Delete report records
      prisma.report.deleteMany({
        where: {
          OR: [{ reporterId: userId }, { reportedUserId: userId }],
        },
      }),
      // Delete user notifications & subscription
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.payment.deleteMany({ where: { userId } }),
      prisma.subscription.deleteMany({ where: { userId } }),
      prisma.profile.deleteMany({ where: { userId } }),
      // Delete User record
      prisma.user.delete({ where: { id: userId } }),
    ]);

    const res = NextResponse.json({
      success: true,
      message: 'Account and all application data permanently deleted',
    });

    res.cookies.set('token', '', {
      httpOnly: true,
      expires: new Date(0),
      path: '/',
    });

    return res;
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
