import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

// Send a message in a ChatSession
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { chatSessionId, content, imageUrl } = body;

    if (!chatSessionId || (!content?.trim() && !imageUrl)) {
      return NextResponse.json({ error: 'Chat session ID and content/image are required' }, { status: 400 });
    }

    // Verify ChatSession exists, is ACTIVE, and user is a participant
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
    });

    if (!session || session.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Chat session is no longer active or has ended' }, { status: 400 });
    }

    if (session.userAId !== user.id && session.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant in this chat' }, { status: 403 });
    }

    const receiverId = session.userAId === user.id ? session.userBId : session.userAId;

    // Create Message record
    const message = await prisma.message.create({
      data: {
        chatSessionId,
        senderId: user.id,
        receiverId,
        content: (content || '').trim(),
        imageUrl: imageUrl || null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullName: true,
            membershipTier: true,
          },
        },
      },
    });

    // Update last activity timestamp
    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { lastActivityAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        chatSessionId: message.chatSessionId,
        senderId: message.senderId,
        senderUsername: message.sender.username,
        receiverId: message.receiverId,
        content: message.content,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Send message error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

// Fetch messages & partner status for a ChatSession
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const chatSessionId = searchParams.get('chatSessionId');

    if (!chatSessionId) {
      return NextResponse.json({ error: 'chatSessionId parameter is required' }, { status: 400 });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      include: {
        userA: { include: { profile: true } },
        userB: { include: { profile: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Chat session not found or has ended', sessionStatus: 'ENDED' }, { status: 404 });
    }

    if (session.userAId !== user.id && session.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const partner = session.userAId === user.id ? session.userB : session.userA;
    const isPartnerVIP = partner.membershipTier === 'VIP';

    const messages = await prisma.message.findMany({
      where: { chatSessionId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({
      sessionStatus: session.status,
      partner: {
        id: partner.id,
        username: partner.username,
        fullName: partner.fullName,
        avatarUrl: partner.profile?.avatarUrl || '/default-avatar.png',
        gender: partner.profile?.gender || 'unspecified',
        mood: partner.profile?.mood || '😎 Attitude',
        personalityPreferences: partner.profile?.personalityPreferences || '',
        bio: partner.profile?.bio || '',
        isVIP: isPartnerVIP,
      },
      messages: messages.map((m) => ({
        id: m.id,
        chatSessionId: m.chatSessionId,
        senderId: m.senderId,
        senderUsername: m.sender.username,
        content: m.content,
        imageUrl: m.imageUrl,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('Get chat messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
