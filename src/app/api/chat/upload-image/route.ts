import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // 1. Authenticate user via Clerk
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in first.' },
        { status: 401 }
      );
    }

    // 2. Strict VIP Verification: Reject free users with HTTP 403 Forbidden
    const isVIP =
      user.is_vip ||
      user.membershipTier === 'VIP' ||
      (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');

    if (!isVIP) {
      return NextResponse.json(
        {
          error: 'Photo sharing is a VIP feature. Upgrade to VIP to send photos in random chats.',
          isVipRequired: true,
        },
        { status: 403 }
      );
    }

    // 3. Parse payload (supports JSON data URI or FormData)
    let buffer: Buffer | null = null;
    let ext = 'jpg';
    let matchId = '';
    let content = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      matchId = body.matchId || '';
      content = body.content || '';
      const imageData = body.imageData;

      if (!imageData || typeof imageData !== 'string') {
        return NextResponse.json(
          { error: 'Invalid or missing image data.' },
          { status: 400 }
        );
      }

      const matches = imageData.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return NextResponse.json(
          { error: 'Invalid image format. Expected base64 data URL.' },
          { status: 400 }
        );
      }

      const rawExt = matches[1].toLowerCase();
      ext = rawExt === 'jpeg' ? 'jpg' : rawExt === 'png' ? 'png' : rawExt === 'webp' ? 'webp' : 'jpg';
      buffer = Buffer.from(matches[2], 'base64');
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      matchId = (formData.get('matchId') as string) || '';
      content = (formData.get('content') as string) || '';

      if (!file) {
        return NextResponse.json({ error: 'No image file uploaded.' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      const mime = file.type.toLowerCase();
      ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    } else {
      return NextResponse.json(
        { error: 'Unsupported Content-Type. Use application/json or multipart/form-data.' },
        { status: 400 }
      );
    }

    if (!buffer || buffer.length === 0) {
      return NextResponse.json({ error: 'Empty image buffer.' }, { status: 400 });
    }

    // 4. File Size Limit: Maximum 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image file size exceeds the 5MB maximum limit.' },
        { status: 400 }
      );
    }

    // 5. Magic Byte Verification (Detect actual binary header)
    const isPng =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isJpg =
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;
    const isWebp =
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;

    const isGif =
      buffer.length >= 4 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38; // 'GIF8' (GIF87a / GIF89a)

    if (!isPng && !isJpg && !isWebp && !isGif) {
      return NextResponse.json(
        {
          error:
            'Invalid file format. Only JPG, JPEG, PNG, WEBP, and GIF image files are permitted. Documents, archives, scripts, and non-image files are strictly rejected.',
        },
        { status: 400 }
      );
    }

    // Correct extension based on validated magic bytes
    ext = isPng ? 'png' : isWebp ? 'webp' : (isGif ? 'gif' : 'jpg');

    // 6. Save image to disk securely
    const randomKey = crypto.randomBytes(16).toString('hex');
    const filename = `vip_photo_${Date.now()}_${randomKey}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'chat-images');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);

    const imageUrl = `/uploads/chat-images/${filename}`;

    // 7. If matchId is provided, write to Firestore via Admin SDK for sub-50ms delivery
    let messageId: string | null = null;
    if (matchId) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          const docRef = await adminDb
            .collection('matches')
            .doc(matchId)
            .collection('messages')
            .add({
              senderUid: user.id,
              senderUsername: user.displayName || user.fullName || 'User',
              content: content.trim(),
              imageUrl,
              createdAt: Date.now(),
            });
          messageId = docRef.id;
        }
      } catch (err) {
        console.warn('Firestore message add sync error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      messageId,
    });
  } catch (error: any) {
    console.error('VIP Image Upload Error:', error);
    return NextResponse.json(
      { error: 'Failed to upload photo: ' + (error?.message || 'Server error') },
      { status: 500 }
    );
  }
}
