import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const now = new Date();
    // Default 2-hour inactivity cutoff
    const inactiveCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Find expired or long-inactive sessions
    const expiredSessions = await prisma.chatSession.findMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { lastActivityAt: { lt: inactiveCutoff } },
          { status: 'ENDED' },
        ],
      },
      select: { id: true },
    });

    const sessionIds = expiredSessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      // Idempotently delete orphan messages and expired sessions
      await prisma.message.deleteMany({
        where: {
          chatSessionId: { in: sessionIds },
        },
      });

      await prisma.chatSession.deleteMany({
        where: {
          id: { in: sessionIds },
        },
      });
    }

    return NextResponse.json({
      success: true,
      cleanedCount: sessionIds.length,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Error running automatic chat cleanup job:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
