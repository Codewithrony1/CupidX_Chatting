import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { releaseDistributedSession } from '@/lib/matchmakingLock';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: chatSessionId } = await params;

    // Verify session existence & user participation
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
    });

    if (!session) {
      // Even if session is not in local SQLite, release distributed Firestore locks
      await releaseDistributedSession({
        sessionId: chatSessionId,
        userAId: user.id,
        endedBy: user.id,
      });
      return NextResponse.json({ message: 'Session already ended or deleted' }, { status: 200 });
    }

    const userIds = [user.id, user.clerkUserId, (user as any).firebaseUid].filter(Boolean) as string[];
    if (!userIds.includes(session.userAId) && !userIds.includes(session.userBId)) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant' }, { status: 403 });
    }

    const partnerId = session.userAId === user.id ? session.userBId : session.userAId;

    // Enforce 60-Second Anti-Rematch Exclusion
    const { addRematchExclusion } = await import('@/lib/antiRematch');
    await addRematchExclusion(user.id, partnerId, 60000);

    // Atomically transition match to ENDED and delete ephemeral messages
    await prisma.$transaction([
      prisma.chatSession.update({
        where: { id: chatSessionId },
        data: {
          status: 'ENDED',
          endedAt: new Date(),
        },
      }),
      prisma.matchmakingQueue.updateMany({
        where: { OR: [{ userId: session.userAId }, { userId: session.userBId }] },
        data: { status: 'CANCELLED', chatSessionId: null, partnerUserId: null },
      }),
      prisma.message.deleteMany({
        where: { chatSessionId },
      }),
    ]);

    // Release distributed active_sessions locks in Cloud Firestore
    await releaseDistributedSession({
      sessionId: chatSessionId,
      userAId: session.userAId,
      userBId: session.userBId,
      endedBy: user.id,
    });

    // Delete ephemeral messages from Firestore
    try {
      const { getAdminDb } = await import('@/lib/firebaseAdmin');
      const adminDb = getAdminDb();
      if (adminDb) {
        const msgsSnap = await adminDb.collection('matches').doc(chatSessionId).collection('messages').get();
        if (!msgsSnap.empty) {
          const batch = adminDb.batch();
          msgsSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Firestore next partner sync notice:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Chat session ended and temporary data permanently deleted on server',
    });
  } catch (error) {
    console.error('Error ending chat session via NEXT:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
