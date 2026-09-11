import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, getOrCreateUserFromClerk } from '@/lib/auth';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Rate limiting in-memory map: userId -> array of timestamps
const userMessageRateMap = new Map<string, number[]>();

async function resolveCanonicalUserId(identifier: string, displayName = 'Stranger'): Promise<string> {
  if (!identifier) return identifier;
  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ id: identifier }, { clerkUserId: identifier }] },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }
    const suffix = Math.random().toString(36).slice(2, 6);
    const created = await prisma.user.create({
      data: {
        id: identifier,
        clerkUserId: identifier,
        username: `user_${identifier.slice(-6)}_${suffix}`,
        fullName: displayName,
        displayName: displayName,
        gender: 'unspecified',
        profile: {
          create: {
            gender: 'unspecified',
            avatarEmoji: '😊',
          },
        },
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    const fallback = await prisma.user.findFirst({
      where: { OR: [{ id: identifier }, { clerkUserId: identifier }] },
      select: { id: true },
    });
    return fallback ? fallback.id : identifier;
  }
}

// Send a message in a ChatSession with Idempotency, Rate Limiting & VIP Image Verification
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { chatSessionId, content, imageUrl: rawImageUrl, imageData, clientMessageId, clerkUserId } = body;

    // 1. Authenticate Clerk User with Header / Body Fallback
    let user = await getCurrentUser(req);
    if (!user) {
      const headerClerkId = req.headers.get('x-clerk-user-id');
      const fallbackClerkId = clerkUserId || headerClerkId;
      if (fallbackClerkId) {
        user = await getOrCreateUserFromClerk(fallbackClerkId);
      }
    }
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

    if (!chatSessionId || (!content?.trim() && !rawImageUrl && !imageData)) {
      return NextResponse.json({ error: 'Chat session ID and content or image are required' }, { status: 400 });
    }

    // 3. Strict IDOR Check: Verify ChatSession exists and user is a participant
    let session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      include: {
        userA: { select: { id: true, clerkUserId: true } },
        userB: { select: { id: true, clerkUserId: true } },
      },
    });

    if (!session) {
      // Cross-container serverless fallback: check Firestore for active match
      try {
        const { getAdminDb } = await import('@/lib/firebaseAdmin');
        const adminDb = getAdminDb();
        if (adminDb) {
          const snap = await adminDb.collection('matches').doc(chatSessionId).get();
          if (snap.exists) {
            const matchDoc = snap.data();
            if (matchDoc && (matchDoc.status === 'active' || matchDoc.status === 'ACTIVE')) {
              const uAId = matchDoc.user1DbId || matchDoc.user1Uid;
              const uBId = matchDoc.user2DbId || matchDoc.user2Uid;
              const [canonicalA, canonicalB] = await Promise.all([
                resolveCanonicalUserId(uAId, matchDoc.user1DisplayName || 'Stranger'),
                resolveCanonicalUserId(uBId, matchDoc.user2DisplayName || 'Stranger'),
              ]);
              session = await prisma.chatSession.upsert({
                where: { id: chatSessionId },
                update: { status: 'ACTIVE' },
                create: {
                  id: chatSessionId,
                  userAId: canonicalA,
                  userBId: canonicalB,
                  status: 'ACTIVE',
                },
                include: {
                  userA: { select: { id: true, clerkUserId: true } },
                  userB: { select: { id: true, clerkUserId: true } },
                },
              });
            }
          }
        }
      } catch (e) {
        console.warn('[MESSAGES_POST] Firestore fallback check error:', e);
      }
    }

    if (!session) {
      return NextResponse.json({ error: 'Chat session not found' }, { status: 404 });
    }

    const userIds = [user.id, user.clerkUserId, (user as any).firebaseUid].filter(Boolean) as string[];
    const isParticipant =
      userIds.includes(session.userAId) ||
      userIds.includes(session.userBId) ||
      (session.userA && (userIds.includes(session.userA.id) || (session.userA.clerkUserId && userIds.includes(session.userA.clerkUserId)))) ||
      (session.userB && (userIds.includes(session.userB.id) || (session.userB.clerkUserId && userIds.includes(session.userB.clerkUserId))));

    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden: You are not a participant in this chat' }, { status: 403 });
    }

    if (session.status !== 'ACTIVE') {
      // Cross-verify with Firestore before rejecting as ended
      let isStillActiveInCloud = false;
      try {
        const { getAdminDb } = await import('@/lib/firebaseAdmin');
        const adminDb = getAdminDb();
        if (adminDb) {
          const snap = await adminDb.collection('matches').doc(chatSessionId).get();
          if (snap.exists) {
            const m = snap.data();
            if (m && (m.status === 'active' || m.status === 'ACTIVE')) {
              isStillActiveInCloud = true;
              await prisma.chatSession.update({
                where: { id: chatSessionId },
                data: { status: 'ACTIVE' },
              });
              session.status = 'ACTIVE';
            }
          }
        }
      } catch (e) {}

      if (!isStillActiveInCloud) {
        return NextResponse.json({ error: 'Chat session has already ended' }, { status: 400 });
      }
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
          let ext = rawExt === 'jpeg' ? 'jpg' : (rawExt === 'png' ? 'png' : (rawExt === 'webp' ? 'webp' : 'jpg'));
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');

          if (buffer.length > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'Image size exceeds 5MB limit.' }, { status: 400 });
          }

          // Magic Bytes Check
          const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
          const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
          const isWebp = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
          const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;

          if (!isPng && !isJpg && !isWebp && !isGif) {
            return NextResponse.json({ error: 'Invalid file format. Only JPG, JPEG, PNG, WEBP, and GIF image files are allowed.' }, { status: 400 });
          }

          ext = isPng ? 'png' : (isWebp ? 'webp' : (isGif ? 'gif' : 'jpg'));

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
          sender: { select: { username: true, displayName: true, fullName: true } },
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
            senderUsername: existingMessage.sender.displayName || existingMessage.sender.fullName || 'Stranger',
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
          select: { username: true, displayName: true, fullName: true },
        },
      },
    });

    // 7. Sync to Firestore matches/{chatSessionId}/messages for sub-50ms push delivery
    try {
      const { getAdminDb } = await import('@/lib/firebaseAdmin');
      const adminDb = getAdminDb();
      if (adminDb) {
        await adminDb
          .collection('matches')
          .doc(chatSessionId)
          .collection('messages')
          .add({
            senderUid: user.id,
            senderUsername: user.displayName || user.fullName || 'Stranger',
            content: (content || '').trim(),
            imageUrl: finalImageUrl,
            createdAt: Date.now(),
          });
      }
    } catch (e) {
      console.warn('Firestore message sync error:', e);
    }

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        clientMessageId: message.clientMessageId,
        chatSessionId: message.chatSessionId,
        senderId: message.senderId,
        senderUsername: message.sender.displayName || message.sender.fullName || 'Stranger',
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
    let user = await getCurrentUser(req);
    if (!user) {
      const headerClerkId = req.headers.get('x-clerk-user-id');
      const { searchParams } = new URL(req.url);
      const queryClerkId = searchParams.get('clerkUserId');
      const fallbackClerkId = headerClerkId || queryClerkId;
      if (fallbackClerkId) {
        user = await getOrCreateUserFromClerk(fallbackClerkId);
      }
    }

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
    let session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      include: {
        userA: { include: { profile: true } },
        userB: { include: { profile: true } },
      },
    });

    if (!session) {
      // Cross-container serverless fallback: check Firestore for active match
      try {
        const { getAdminDb } = await import('@/lib/firebaseAdmin');
        const adminDb = getAdminDb();
        if (adminDb) {
          const snap = await adminDb.collection('matches').doc(chatSessionId).get();
          if (snap.exists) {
            const matchDoc = snap.data();
            if (matchDoc && (matchDoc.status === 'active' || matchDoc.status === 'ACTIVE')) {
              const uAId = matchDoc.user1DbId || matchDoc.user1Uid;
              const uBId = matchDoc.user2DbId || matchDoc.user2Uid;
              const [canonicalA, canonicalB] = await Promise.all([
                resolveCanonicalUserId(uAId, matchDoc.user1DisplayName || 'Stranger'),
                resolveCanonicalUserId(uBId, matchDoc.user2DisplayName || 'Stranger'),
              ]);
              session = await prisma.chatSession.upsert({
                where: { id: chatSessionId },
                update: { status: 'ACTIVE' },
                create: {
                  id: chatSessionId,
                  userAId: canonicalA,
                  userBId: canonicalB,
                  status: 'ACTIVE',
                },
                include: {
                  userA: { include: { profile: true } },
                  userB: { include: { profile: true } },
                },
              });
            }
          }
        }
      } catch (e) {
        console.warn('[MESSAGES_GET] Firestore fallback check error:', e);
      }
    }

    if (!session) {
      return NextResponse.json({ error: 'Chat session not found', sessionStatus: 'PENDING' }, { status: 404 });
    }

    const userIds = [user.id, user.clerkUserId, (user as any).firebaseUid].filter(Boolean) as string[];
    const isParticipant =
      userIds.includes(session.userAId) ||
      userIds.includes(session.userBId) ||
      (session.userA && (userIds.includes(session.userA.id) || (session.userA.clerkUserId && userIds.includes(session.userA.clerkUserId)))) ||
      (session.userB && (userIds.includes(session.userB.id) || (session.userB.clerkUserId && userIds.includes(session.userB.clerkUserId))));

    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden: Access denied' }, { status: 403 });
    }

    // Self-heal active status from cloud if local DB was out of sync
    if (session.status !== 'ACTIVE') {
      try {
        const { getAdminDb } = await import('@/lib/firebaseAdmin');
        const adminDb = getAdminDb();
        if (adminDb) {
          const snap = await adminDb.collection('matches').doc(chatSessionId).get();
          if (snap.exists) {
            const m = snap.data();
            if (m && (m.status === 'active' || m.status === 'ACTIVE')) {
              await prisma.chatSession.update({
                where: { id: chatSessionId },
                data: { status: 'ACTIVE' },
              });
              session.status = 'ACTIVE';
            }
          }
        }
      } catch (e) {}
    }

    const isUserA = userIds.includes(session.userAId) || (session.userA && (userIds.includes(session.userA.id) || (session.userA.clerkUserId && userIds.includes(session.userA.clerkUserId))));
    const partner = isUserA ? session.userB : session.userA;
    const isPartnerVIP = Boolean(partner?.membershipTier === 'VIP' || partner?.is_vip);

    // Filter messages
    const messageWhere: any = { chatSessionId };
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        messageWhere.createdAt = { gt: sinceDate };
      }
    }

    const rawMessages = await prisma.message.findMany({
      where: messageWhere,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        sender: {
          select: { username: true, displayName: true, fullName: true },
        },
      },
    });

    // Reverse to return chronologically ascending order (oldest to newest)
    const messages = rawMessages.reverse();

    return NextResponse.json({
      success: true,
      sessionStatus: session.status,
      partner: partner
        ? {
            id: partner.id,
            username: partner.username || 'user',
            displayName: partner.displayName || partner.fullName || 'Stranger',
            gender: partner.profile?.gender || partner.gender || 'unspecified',
            avatarEmoji: partner.profile?.avatarEmoji || '😊',
            avatarUrl: partner.profile?.avatarUrl || null,
            isVIP: isPartnerVIP,
          }
        : null,
      messages: messages.map((m) => ({
        id: m.id,
        clientMessageId: m.clientMessageId,
        chatSessionId: m.chatSessionId,
        senderId: m.senderId,
        senderUsername: m.sender.displayName || m.sender.fullName || m.sender.username || 'Stranger',
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
