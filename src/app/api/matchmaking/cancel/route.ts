import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.matchmakingQueue.updateMany({
      where: { userId: user.id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true, message: 'Cancelled matchmaking' });
  } catch (error: any) {
    console.error('Matchmaking Cancel Error:', error);
    return NextResponse.json({ error: 'Failed to cancel matchmaking' }, { status: 500 });
  }
}
