import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Retrieve all messages for the user ordered by newest
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user.id },
          { receiverId: user.id }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profile: { select: { avatarUrl: true, isOnline: true } }
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            fullName: true,
            profile: { select: { avatarUrl: true, isOnline: true } }
          }
        }
      }
    });

    const recentChatsMap = new Map();

    for (const msg of messages) {
      const otherUser = msg.senderId === user.id ? msg.receiver : msg.sender;
      if (!otherUser) continue;

      if (!recentChatsMap.has(otherUser.id)) {
        recentChatsMap.set(otherUser.id, {
          userId: otherUser.id,
          username: otherUser.username,
          fullName: otherUser.fullName,
          avatarUrl: otherUser.profile?.avatarUrl || '/default-avatar.png',
          isOnline: otherUser.profile?.isOnline || false,
          lastMessage: {
            id: msg.id,
            content: msg.isDeleted ? 'This message was deleted' : msg.content,
            imageUrl: msg.imageUrl,
            createdAt: msg.createdAt,
            isRead: msg.isRead,
            senderId: msg.senderId,
          }
        });
      }
    }

    const recentChats = Array.from(recentChatsMap.values());

    // Fetch blocks to filter out
    const blocks = await prisma.block.findMany({
      where: {
        OR: [
          { blockerId: user.id },
          { blockedId: user.id }
        ]
      }
    });

    const blockedUserIds = new Set(
      blocks.map(b => b.blockerId === user.id ? b.blockedId : b.blockerId)
    );

    const filteredChats = recentChats.filter(chat => !blockedUserIds.has(chat.userId));

    return NextResponse.json({ rooms: filteredChats });
  } catch (error) {
    console.error('Get recent chats error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
