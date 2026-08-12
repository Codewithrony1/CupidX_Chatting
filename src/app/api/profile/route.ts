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

  // Check if mood is expired
  if (user.profile?.moodExpiresAt && new Date() > new Date(user.profile.moodExpiresAt)) {
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        mood: '',
        moodExpiresAt: null,
      },
    });
    user.profile.mood = '';
    user.profile.moodExpiresAt = null;
  }

  return NextResponse.json({ profile: user.profile, subscription: user.subscription, membershipTier: user.membershipTier });
}

export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');

    const body = await req.json();
    const {
      bio,
      showBio,
      age,
      gender,
      showGender,
      preferredGender,
      personalityPreferences,
      mood,
      showMood,
      moodDuration,
      language,
      saveChatHistory,
      interests,
      themePreference,
      avatarData,
      avatarUrlPreset,
    } = body;

    // Strict Server-side VIP Protection for VIP-only features
    const isUpdatingVIPAvatar = (avatarData && avatarData.startsWith('data:image/')) || (avatarUrlPreset && avatarUrlPreset.includes('api.dicebear.com'));
    const isUpdatingVIPPreferences = preferredGender && preferredGender !== 'auto';
    const isUpdatingVIPMood = mood !== undefined || moodDuration !== undefined;
    const isUpdatingVIPPersonality = personalityPreferences !== undefined;

    if ((isUpdatingVIPAvatar || isUpdatingVIPPreferences || isUpdatingVIPMood || isUpdatingVIPPersonality) && !isVIP) {
      return NextResponse.json(
        {
          error: 'Custom moods, personality styles, custom avatars & targeted discovery preferences require CupidX VIP.',
          isVipRequired: true,
        },
        { status: 403 }
      );
    }

    let avatarUrl = avatarUrlPreset !== undefined ? avatarUrlPreset : undefined;

    if (isUpdatingVIPAvatar && isVIP) {
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

    // Calculate mood expiration timestamp
    let moodExpiresAt: Date | null | undefined = undefined;
    if (moodDuration === '1hour') {
      moodExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    } else if (moodDuration === '24hours') {
      moodExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (moodDuration === 'never') {
      moodExpiresAt = null;
    }

    const updatedProfile = await prisma.profile.update({
      where: { userId: user.id },
      data: {
        bio: bio !== undefined ? bio : undefined,
        showBio: showBio !== undefined ? Boolean(showBio) : undefined,
        age: age !== undefined ? parseInt(age.toString(), 10) : undefined,
        gender: gender !== undefined ? gender : undefined,
        showGender: showGender !== undefined ? Boolean(showGender) : undefined,
        preferredGender: preferredGender !== undefined ? preferredGender : undefined,
        personalityPreferences: personalityPreferences !== undefined ? personalityPreferences : undefined,
        mood: mood !== undefined ? mood : undefined,
        showMood: showMood !== undefined ? Boolean(showMood) : undefined,
        moodExpiresAt: moodExpiresAt !== undefined ? moodExpiresAt : undefined,
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
