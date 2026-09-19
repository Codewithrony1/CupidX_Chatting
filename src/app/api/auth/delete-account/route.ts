import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, getAuthCookieOptions } from '@/lib/auth';

export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = user.id;

    // Delete associated resources
    await prisma.$transaction([
      prisma.matchmakingQueue.deleteMany({ where: { userId } }),
      prisma.message.deleteMany({
        where: { senderId: userId },
      }),
      prisma.privateMessage.deleteMany({
        where: { senderId: userId },
      }),
      prisma.callSession.deleteMany({
        where: {
          OR: [{ callerId: userId }, { receiverId: userId }],
        },
      }),
      prisma.friendship.deleteMany({
        where: {
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
      }),
      prisma.friendRequest.deleteMany({
        where: {
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
      }),
      prisma.block.deleteMany({
        where: {
          OR: [{ blockerId: userId }, { blockedId: userId }],
        },
      }),
      prisma.report.deleteMany({
        where: {
          OR: [{ reporterId: userId }, { reportedUserId: userId }],
        },
      }),
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
      ...getAuthCookieOptions(req, 0),
      expires: new Date(0),
      maxAge: 0,
    });

    return res;
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
