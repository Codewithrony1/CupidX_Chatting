import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetUsername = searchParams.get('username');

    if (!targetUsername) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { username: targetUsername.toLowerCase().trim() },
      include: { profile: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check block status
    const blockRelation = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: targetUser.id },
          { blockerId: targetUser.id, blockedId: user.id }
        ]
      }
    });

    const isBlocked = !!blockRelation;
    const blockedByMe = blockRelation ? blockRelation.blockerId === user.id : false;

    // Fetch messages ordered chronologically
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: user.id }
        ]
      },
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullName: true,
          }
        }
      }
    });

    return NextResponse.json({
      messages,
      targetUser: {
        id: targetUser.id,
        username: targetUser.username,
        fullName: targetUser.fullName,
        avatarUrl: targetUser.profile?.avatarUrl || '/default-avatar.png',
        isOnline: targetUser.profile?.isOnline || false,
        bio: targetUser.profile?.bio || '',
        age: targetUser.profile?.age || 18,
        gender: targetUser.profile?.gender || 'unspecified',
        interests: targetUser.profile?.interests || '',
      },
      isBlocked,
      blockedByMe,
    });
  } catch (error) {
    console.error('Chat history error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
