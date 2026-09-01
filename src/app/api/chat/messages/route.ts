import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Rate limiting in-memory map: userId -> array of timestamps
const userMessageRateMap = new Map<string, number[]>();

// Send a message in a ChatSession with Idempotency, Rate Limiting & VIP Image Verification
export async function POST(req: Request) {
  try {
    // 1. Authenticate Clerk User
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    // 2. Server-side Rate Limiting (Max 6 messages per 3 seconds per user)
    const now = Date.now();
    const timestamps = userMessageRateMap.get(user.id) || [];
    const recentTimestamps = timestamps.filter((t) => now - t < 3000);

    if (recentTimestamps.length >= 6) {
      return NextResponse.json(
        { error: 'Too many messages. Please slow down.' },
        { status: 429 }
      );
    }
    recentTimestamps.push(now);
    userMessageRateMap.set(user.id, recentTimestamps);

    const body = await req.json().catch(() => ({}));
    const { chatSessionId, content, imageUrl: rawImageUrl, imageData, clientMessageId } = body;

    if (!chatSessionId || (!content?.trim() && !rawImageUrl && !imageData)) {
      return NextResponse.json({ error: 'Chat session ID and content or image are required' }, { status: 400 });
    }

    // 3. Strict IDOR Check: Verify ChatSession exists and user is a participant
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

    // 4. VIP Image Verification & Secure Image Processing
    let finalImageUrl: string | null = rawImageUrl || null;
    const isSendingImage = Boolean(rawImageUrl || imageData);

    if (isSendingImage) {
      const isVIP = user.is_vip || user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');
      if (!isVIP) {
        return NextResponse.json(
          {
            error: 'Image sharing is an exclusive CupidX VIP feature. Upgrade to VIP to send photos in chat.',
            isVipRequired: true,
          },
          { status: 403 }
        );
      }

      if (imageData && imageData.startsWith('data:image/')) {
        const matches = imageData.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const rawExt = matches[1].toLowerCase();
          const ext = rawExt === 'jpeg' ? 'jpg' : (rawExt === 'png' ? 'png' : (rawExt === 'webp' ? 'webp' : 'jpg'));
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');

          if (buffer.length > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'Image size exceeds 5MB limit.' }, { status: 400 });
          }

          // Magic Bytes Check
          const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
          const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
          const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;

          if (!isPng && !isJpg && !isWebp) {
            return NextResponse.json({ error: 'Invalid image format. Only JPEG, PNG, and WebP are allowed.' }, { status: 400 });
          }

          const randomKey = crypto.randomBytes(12).toString('hex');
          const filename = `chat_img_${Date.now()}_${randomKey}.${ext}`;
          const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'chat-images');
          await fs.mkdir(uploadDir, { recursive: true });

          await fs.writeFile(path.join(uploadDir, filename), buffer);
          finalImageUrl = `/uploads/chat-images/${filename}`;
        }
      }
    }

    // 5. Idempotency Check: Prevent duplicate messages during network retries
    if (clientMessageId) {
      const existingMessage = await prisma.message.findFirst({
        where: { clientMessageId },
        include: {
          sender: { select: { username: true } },
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

    // 6. Create Message record in DB
    const message = await prisma.message.create({
      data: {
        chatSessionId,
        clientMessageId: clientMessageId || null,
        senderId: user.id,
        content: (content || '').trim(),
        imageUrl: finalImageUrl,
      },
      include: {
        sender: {
          select: { username: true },
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

// Fetch messages & partner status for a ChatSession
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const chatSessionId = searchParams.get('chatSessionId');
    const since = searchParams.get('since');

    if (!chatSessionId) {
      return NextResponse.json({ error: 'chatSessionId parameter is required' }, { status: 400 });
    }

    // Strict Authorization Check
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
    const isPartnerVIP = partner.membershipTier === 'VIP' || partner.is_vip;

    // Filter messages
    const messageWhere: any = { chatSessionId };
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        messageWhere.createdAt = { gt: sinceDate };
      }
    }

    const messages = await prisma.message.findMany({
      where: messageWhere,
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        sender: {
          select: { username: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      sessionStatus: session.status,
      partner: {
        id: partner.id,
        username: partner.username,
        displayName: partner.displayName || partner.fullName,
        gender: partner.profile?.gender || partner.gender,
        avatarEmoji: partner.profile?.avatarEmoji || '😊',
        avatarUrl: partner.profile?.avatarUrl,
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
    console.error('Get messages error:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}
