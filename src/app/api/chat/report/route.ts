import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawTargetId = body.targetUserId || body.reportedUserId;
    const reason = body.reason;
    const chatSessionId = body.chatSessionId || body.matchId;

    if (!rawTargetId || !reason) {
      return NextResponse.json({ error: 'Missing targetUserId or reason' }, { status: 400 });
    }

    // Resolve target User by id, clerkUserId, or firebaseUid
    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: rawTargetId },
          { clerkUserId: rawTargetId },
          { firebaseUid: rawTargetId },
          { username: rawTargetId },
        ],
      },
    });

    const targetUserId = targetUser ? targetUser.id : rawTargetId;

    // Capture snapshot of active conversation messages before wiping ephemeral chat
    let snapshotMessages: string | null = null;
    try {
      let activeSession = null;
      if (chatSessionId) {
        activeSession = await prisma.chatSession.findUnique({
          where: { id: chatSessionId },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 50,
            },
          },
        });
      }

      if (!activeSession) {
        activeSession = await prisma.chatSession.findFirst({
          where: {
            OR: [
              { userAId: user.id, userBId: targetUserId },
              { userAId: targetUserId, userBId: user.id },
            ],
          },
          orderBy: { startedAt: 'desc' },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 50,
            },
          },
        });
      }

      if (activeSession && activeSession.messages.length > 0) {
        snapshotMessages = JSON.stringify(
          activeSession.messages.map((m) => ({
            id: m.id,
            senderId: m.senderId,
            content: m.content,
            createdAt: m.createdAt,
          }))
        );
      }
    } catch (e) {
      console.warn('Prisma snapshot capture error:', e);
    }

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedUserId: targetUserId,
        reason,
        snapshotMessages,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      message: 'Report submitted successfully. Conversation snapshot captured for review.',
      report,
    });
  } catch (error) {
    console.error('Report error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
