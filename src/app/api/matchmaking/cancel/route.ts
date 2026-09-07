import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check race condition: did a match succeed right before cancellation arrived?
    const currentQueue = await prisma.matchmakingQueue.findUnique({
      where: { userId: user.id },
    });

    if (currentQueue?.status === 'MATCHED' && currentQueue.chatSessionId) {
      const session = await prisma.chatSession.findUnique({
        where: { id: currentQueue.chatSessionId },
      });

      if (session && session.status === 'ACTIVE') {
        // Match won the race condition: inform client so both stay connected
        return NextResponse.json({
          success: false,
          matched: true,
          chatSessionId: session.id,
          message: 'Match already established.',
        });
      }
    }

    // Cancel wins: remove from queue and mark CANCELLED
    await prisma.matchmakingQueue.updateMany({
      where: { userId: user.id },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date(),
      },
    });

    // Mirror cancellation to Firestore queue doc
    try {
      const { getAdminDb } = await import('@/lib/firebaseAdmin');
      const adminDb = getAdminDb();
      if (adminDb) {
        await adminDb.collection('matchmaking').doc(user.id).delete();
      }
    } catch (e) {}

    return NextResponse.json({
      success: true,
      cancelled: true,
      message: 'Matchmaking successfully cancelled.',
    });
  } catch (error: any) {
    console.error('Matchmaking Cancel Error:', error);
    return NextResponse.json({ error: 'Failed to cancel matchmaking' }, { status: 500 });
  }
}
