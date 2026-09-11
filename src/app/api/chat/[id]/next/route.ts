import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

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
      return NextResponse.json({ message: 'Session already ended or deleted' }, { status: 200 });
    }

    const userIds = [user.id, user.clerkUserId, (user as any).firebaseUid].filter(Boolean) as string[];
    if (!userIds.includes(session.userAId) && !userIds.includes(session.userBId)) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant' }, { status: 403 });
    }

    if (session.status === 'ENDED') {
      return NextResponse.json({ message: 'Session already ended' }, { status: 200 });
    }

    // Atomically transition match to ENDED and delete ephemeral messages (Requirement 3 & 10)
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


    // Also sync to Firestore so partner client receives 'ended' status immediately
    try {
      const { getAdminDb } = await import('@/lib/firebaseAdmin');
      const adminDb = getAdminDb();
      if (adminDb) {
        await adminDb.collection('matches').doc(chatSessionId).set(
          {
            status: 'ended',
            endedAt: Date.now(),
            endedBy: user.id,
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn('Firestore next partner sync error:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Chat session and temporary data permanently deleted on server',
    });
  } catch (error) {
    console.error('Error ending chat session via NEXT:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
