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
    const { messageId, clientMessageId, chatSessionId } = body;

    if (!messageId && !clientMessageId) {
      return NextResponse.json({ error: 'messageId or clientMessageId is required' }, { status: 400 });
    }

    const now = new Date();

    const message = await prisma.message.findFirst({
      where: {
        OR: [
          ...(messageId ? [{ id: messageId }] : []),
          ...(clientMessageId ? [{ clientMessageId }] : []),
        ],
        ...(chatSessionId ? { chatSessionId } : {}),
      },
    });

    if (message && !message.deliveredAt) {
      await prisma.message.update({
        where: { id: message.id },
        data: { deliveredAt: now },
      });
    }

    return NextResponse.json({
      success: true,
      deliveredAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error('Ack message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
