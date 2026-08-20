import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const now = new Date();
    // Default 24-hour cutoff for ephemeral sessions
    const oldCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find ended or old ephemeral sessions
    const expiredSessions = await prisma.chatSession.findMany({
      where: {
        OR: [
          { startedAt: { lt: oldCutoff } },
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
    console.error('Error during cleanup cron:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
