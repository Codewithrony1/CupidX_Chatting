import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function GET(req: Request) {
  try {
    // 1. Authorize: Require valid CRON_SECRET or Admin access
    const authHeader = req.headers.get('authorization');
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET || 'cupidx_cron_internal_secret_key';

    const hasValidSecret =
      (authHeader && authHeader === `Bearer ${cronSecret}`) ||
      (querySecret && querySecret === cronSecret);

    if (!hasValidSecret) {
      const { authorized } = await verifyAdminAccess(req);
      if (!authorized) {
        return NextResponse.json({ error: 'Unauthorized cron access' }, { status: 401 });
      }
    }

    const now = new Date();
    // 7-day retention period for ephemeral sessions without saved history
    const retentionCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Only clean up sessions that ended > 7 days ago, where neither user opted into
    // saveChatHistory, and where no active user reports are attached
    const expiredSessions = await prisma.chatSession.findMany({
      where: {
        status: 'ENDED',
        endedAt: { lt: retentionCutoff },
        userA: {
          profile: {
            saveChatHistory: false,
          },
        },
        userB: {
          profile: {
            saveChatHistory: false,
          },
        },
      },
      select: { id: true },
      take: 500, // Batch limit to prevent locking SQLite
    });

    const sessionIds = expiredSessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      await prisma.$transaction([
        prisma.message.deleteMany({
          where: {
            chatSessionId: { in: sessionIds },
          },
        }),
        prisma.chatSession.deleteMany({
          where: {
            id: { in: sessionIds },
          },
        }),
      ]);
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
