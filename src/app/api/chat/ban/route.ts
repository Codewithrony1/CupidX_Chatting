import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bans = await prisma.userBan.findMany({
      where: { bannedByUserId: user.id },
      include: {
        bannedUser: {
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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ bans });
  } catch (error) {
    console.error('GET /api/chat/ban error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SERVER-SIDE VIP CHECK (Strict Membership Verification)
    const isVIP = user.subscription?.isActive || false;
    if (!isVIP) {
      return NextResponse.json(
        {
          error: 'Personal user bans are an exclusive VIP feature.',
          isVipRequired: true,
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { targetUserId, action = 'ban' } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'You cannot ban yourself.' }, { status: 400 });
    }

    if (action === 'unban') {
      await prisma.userBan.deleteMany({
        where: {
          bannedByUserId: user.id,
          bannedUserId: targetUserId,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'User unbanned successfully',
      });
    }

    // Perform Personal User-to-User Ban
    await prisma.userBan.upsert({
      where: {
        bannedByUserId_bannedUserId: {
          bannedByUserId: user.id,
          bannedUserId: targetUserId,
        },
      },
      create: {
        bannedByUserId: user.id,
        bannedUserId: targetUserId,
      },
      update: {},
    });

    // Also end any active 1-to-1 chat session if active
    await prisma.chatSession.deleteMany({
      where: {
        OR: [
          { userAId: user.id, userBId: targetUserId },
          { userAId: targetUserId, userBId: user.id },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Personal ban applied successfully',
    });
  } catch (error) {
    console.error('POST /api/chat/ban error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
