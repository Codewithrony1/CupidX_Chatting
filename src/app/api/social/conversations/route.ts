import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser } from '@/lib/vipAuth';

export async function GET(req: Request) {
  try {
    const { user, response } = await requireAuthUser(req);
    if (response) return response;

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ user1Id: user!.id }, { user2Id: user!.id }],
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user1: {
          select: {
            id: true,
            vipUsername: true,
            username: true,
            displayName: true,
            fullName: true,
            profile: { select: { avatarUrl: true, avatarEmoji: true, isOnline: true } },
          },
        },
        user2: {
          select: {
            id: true,
            vipUsername: true,
            username: true,
            displayName: true,
            fullName: true,
            profile: { select: { avatarUrl: true, avatarEmoji: true, isOnline: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const formatted = conversations.map((conv) => {
      const partner = conv.user1Id === user!.id ? conv.user2 : conv.user1;
      const lastMsg = conv.messages[0] || null;

      return {
        id: conv.id,
        partner: {
          id: partner.id,
          username: partner.vipUsername || partner.username,
          hasVipUsername: Boolean(partner.vipUsername),
          displayName: partner.displayName || partner.fullName || 'CupidX Member',
          avatarUrl: partner.profile?.avatarUrl || null,
          avatarEmoji: partner.profile?.avatarEmoji || '😊',
          isOnline: partner.profile?.isOnline || false,
        },
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              type: lastMsg.type,
              content: lastMsg.content,
              imageUrl: lastMsg.imageUrl,
              senderId: lastMsg.senderId,
              isMine: lastMsg.senderId === user!.id,
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
        lastMessageAt: conv.lastMessageAt.toISOString(),
      };
    });

    return NextResponse.json({ conversations: formatted });
  } catch (error: any) {
    console.error('Fetch conversations error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations.' }, { status: 500 });
  }
}
