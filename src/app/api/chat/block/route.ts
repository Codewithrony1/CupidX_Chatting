import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const blocks = await prisma.block.findMany({
      where: { blockerId: user.id },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profile: {
              select: {
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    const formatted = blocks.map((b) => ({
      id: b.id,
      blockedId: b.blockedId,
      blockedUser: {
        username: b.blocked.username,
        fullName: b.blocked.fullName,
        avatarUrl: b.blocked.profile?.avatarUrl || '/default-avatar.png',
      },
    }));

    return NextResponse.json({ blockedUsers: formatted });
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { targetUserId, action } = await req.json();

    if (!targetUserId || !action) {
      return NextResponse.json({ error: 'Missing targetUserId or action' }, { status: 400 });
    }

    if (action === 'block') {
      const existing = await prisma.block.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: user.id,
            blockedId: targetUserId,
          },
        },
      });

      if (existing) {
        return NextResponse.json({ message: 'User already blocked' });
      }

      await prisma.block.create({
        data: {
          blockerId: user.id,
          blockedId: targetUserId,
        },
      });

      return NextResponse.json({ message: 'User blocked successfully' });
    } else if (action === 'unblock') {
      await prisma.block.deleteMany({
        where: {
          blockerId: user.id,
          blockedId: targetUserId,
        },
      });

      return NextResponse.json({ message: 'User unblocked successfully' });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Block error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
