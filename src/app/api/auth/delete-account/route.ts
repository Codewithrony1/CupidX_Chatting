import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, getAuthCookieOptions } from '@/lib/auth';

async function performAccountDeletion(req: Request) {
  try {
    let user: any = await getCurrentUser(req);
    if (!user) {
      try {
        const { auth: clerkAuth } = await import('@clerk/nextjs/server');
        const session = await clerkAuth();
        if (session?.userId) {
          user = await prisma.user.findFirst({
            where: { OR: [{ clerkUserId: session.userId }, { id: session.userId }] },
          });
        }
      } catch (e) {}
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Active session required.' }, { status: 401 });
    }

    // Require explicit confirmation to prevent accidental or CSRF deletion
    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== 'DELETE' && body?.confirmText !== 'DELETE') {
      return NextResponse.json(
        { error: 'High-impact confirmation required. You must submit { confirmText: "DELETE" }.' },
        { status: 400 }
      );
    }

    const userId = user.id;

    // 1. Terminate any active random chat sessions and notify partner
    try {
      const activeSessions = await prisma.chatSession.findMany({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          status: 'ACTIVE',
        },
      });

      for (const session of activeSessions) {
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { status: 'ENDED', endedAt: new Date() },
        }).catch(() => {});

        await prisma.message.deleteMany({
          where: { chatSessionId: session.id },
        }).catch(() => {});

        try {
          const { getAdminDb } = await import('@/lib/firebaseAdmin');
          const adminDb = getAdminDb();
          if (adminDb) {
            await adminDb.collection('matches').doc(session.id).set({
              status: 'ended',
              endedAt: Date.now(),
            }, { merge: true }).catch(() => {});
          }
        } catch (e) {}
      }
    } catch (chatErr) {
      console.warn('Active chat cleanup notice during deletion:', chatErr);
    }

    // 2. Remove user from matchmaking queues
    try {
      await prisma.matchmakingQueue.deleteMany({ where: { userId } }).catch(() => {});
      const { getAdminDb } = await import('@/lib/firebaseAdmin');
      const adminDb = getAdminDb();
      if (adminDb) {
        await adminDb.collection('matchmaking').doc(userId).delete().catch(() => {});
        await adminDb.collection('users').doc(userId).delete().catch(() => {});
      }
    } catch (queueErr) {
      console.warn('Queue cleanup notice during deletion:', queueErr);
    }

    // 3. Atomically delete all user-associated records from database
    await prisma.$transaction([
      prisma.userConsent.deleteMany({ where: { userId } }),
      prisma.message.deleteMany({ where: { senderId: userId } }),
      prisma.privateMessage.deleteMany({ where: { senderId: userId } }),
      prisma.callSession.deleteMany({
        where: { OR: [{ callerId: userId }, { receiverId: userId }] },
      }),
      prisma.friendship.deleteMany({
        where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      }),
      prisma.friendRequest.deleteMany({
        where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      }),
      prisma.block.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      }),
      prisma.report.deleteMany({
        where: { OR: [{ reporterId: userId }, { reportedUserId: userId }] },
      }),
      prisma.subscription.deleteMany({ where: { userId } }),
      prisma.profile.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    // 4. Invalidate and delete Clerk authentication account
    const clerkId = user.clerkUserId;
    if (clerkId) {
      try {
        const { clerkClient } = await import('@clerk/nextjs/server');
        const client = await clerkClient();
        await client.users.deleteUser(clerkId);
      } catch (clerkErr) {
        console.warn('Clerk user deletion notice (account may already be removed):', clerkErr);
      }
    }

    const res = NextResponse.json({
      success: true,
      message: 'Account, identity, profile, and all application data permanently deleted.',
    });

    // 5. Invalidate auth session cookies
    res.cookies.set('token', '', {
      ...getAuthCookieOptions(req, 0),
      expires: new Date(0),
      maxAge: 0,
    });

    return res;
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { error: 'Unable to complete account deletion at this time. Please try again.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  return performAccountDeletion(req);
}

export async function POST(req: Request) {
  return performAccountDeletion(req);
}
