import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';

export async function GET(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ profile: user.profile, subscription: user.subscription });
}

export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      bio,
      age,
      gender,
      preferredGender,
      language,
      saveChatHistory,
      interests,
      themePreference,
      avatarData,
    } = body;

    let avatarUrl = undefined;

    if (avatarData && avatarData.startsWith('data:image/')) {
      const matches = avatarData.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `${user.username}-${Date.now()}.${ext}`;

        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });

        await fs.writeFile(path.join(uploadDir, filename), buffer);
        avatarUrl = `/uploads/${filename}`;
      }
    }

    const updatedProfile = await prisma.profile.update({
      where: { userId: user.id },
      data: {
        bio: bio !== undefined ? bio : undefined,
        age: age !== undefined ? parseInt(age.toString(), 10) : undefined,
        gender: gender !== undefined ? gender : undefined,
        preferredGender: preferredGender !== undefined ? preferredGender : undefined,
        language: language !== undefined ? language : undefined,
        saveChatHistory: saveChatHistory !== undefined ? Boolean(saveChatHistory) : undefined,
        interests: interests !== undefined ? interests : undefined,
        themePreference: themePreference !== undefined ? themePreference : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
      },
    });

    return NextResponse.json({
      message: 'Profile updated successfully',
      profile: updatedProfile,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
