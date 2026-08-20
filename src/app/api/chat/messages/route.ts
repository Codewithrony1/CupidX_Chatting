import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

// Send a message in a ChatSession with Idempotency & Strict Authorization
export async function POST(req: Request) {
  try {
    // 1. Authenticate Clerk User (Never trust client-supplied userId)
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { chatSessionId, content, imageUrl, clientMessageId } = body;

    if (!chatSessionId || (!content?.trim() && !imageUrl)) {
      return NextResponse.json({ error: 'Chat session ID and content/image are required' }, { status: 400 });
    }

    // 2. Strict IDOR Check: Verify ChatSession exists and user is a legitimate participant
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    if (session.userAId !== user.id && session.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant in this chat' }, { status: 403 });
    }

    if (session.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Chat session has already ended' }, { status: 400 });
    }

    // 3. Idempotency Check: Prevent duplicate messages during retries
    if (clientMessageId) {
      const existingMessage = await prisma.message.findFirst({
        where: { clientMessageId },
        include: {
          sender: {
            select: { username: true },
          },
        },
      });

      if (existingMessage) {
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          message: {
            id: existingMessage.id,
            clientMessageId: existingMessage.clientMessageId,
            chatSessionId: existingMessage.chatSessionId,
            senderId: existingMessage.senderId,
            senderUsername: existingMessage.sender.username,
            content: existingMessage.content,
            imageUrl: existingMessage.imageUrl,
            createdAt: existingMessage.createdAt.toISOString(),
          },
        });
      }
    }

    const receiverId = session.userAId === user.id ? session.userBId : session.userAId;

    // 4. Create Message record in DB (Guaranteed server persistence BEFORE response)
    const message = await prisma.message.create({
      data: {
        chatSessionId,
        clientMessageId: clientMessageId || null,
        senderId: user.id, // Strictly derived from server Clerk session
        content: (content || '').trim(),
        imageUrl: imageUrl || null,
      },
      include: {
        sender: {
          select: {
            username: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        clientMessageId: message.clientMessageId,
        chatSessionId: message.chatSessionId,
        senderId: message.senderId,
        senderUsername: message.sender.username,
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

// Fetch messages & partner status for a ChatSession with Authorization & Recovery
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const chatSessionId = searchParams.get('chatSessionId');
    const since = searchParams.get('since'); // Message recovery timestamp

    if (!chatSessionId) {
      return NextResponse.json({ error: 'chatSessionId parameter is required' }, { status: 400 });
    }

    // 1. Strict Authorization Check
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      include: {
        userA: { include: { profile: true } },
        userB: { include: { profile: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Chat session not found', sessionStatus: 'ENDED' }, { status: 404 });
    }

    if (session.userAId !== user.id && session.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: Access denied' }, { status: 403 });
    }

    const partner = session.userAId === user.id ? session.userB : session.userA;
    const isPartnerVIP = partner.membershipTier === 'VIP';

    // 2. Fetch Messages (supporting incremental recovery)
    const whereClause: any = { chatSessionId };
    if (since) {
      whereClause.createdAt = { gt: new Date(since) };
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: { username: true },
        },
      },
    });

    // 3. Return MINIMUM safe public data fields (no sensitive internal IDs/emails/secrets)
    return NextResponse.json({
      sessionStatus: session.status,
      partner: {
        id: partner.id,
        username: partner.username,
        fullName: partner.fullName,
        displayName: partner.displayName || partner.fullName || partner.username,
        avatarType: partner.profile?.avatarType || 'EMOJI',
        avatarEmoji: partner.profile?.avatarEmoji || '😊',
        avatarUrl: partner.profile?.avatarUrl || null,
        gender: partner.profile?.gender || 'unspecified',
        mood: partner.profile?.mood || '',
        personalityPreferences: partner.profile?.personalityPreferences || '',
        bio: partner.profile?.bio || '',
        isVIP: isPartnerVIP,
      },
      messages: messages.map((m) => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
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
