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

    if (session.userAId !== user.id && session.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant' }, { status: 403 });
    }

    // Perform Server-Side Deletion: Delete all messages & session record
    await prisma.$transaction([
      prisma.message.deleteMany({
        where: { chatSessionId },
      }),
      prisma.chatSession.delete({
        where: { id: chatSessionId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Chat session and temporary data permanently deleted on server',
    });
  } catch (error) {
    console.error('Error ending chat session via NEXT:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
