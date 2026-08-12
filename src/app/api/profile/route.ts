import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { FREE_AVATARS, isVipAvatar } from '@/lib/avatars';
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
    // 1. Derive User Identity strictly from authenticated Clerk session
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');

    const body = await req.json().catch(() => ({}));
    const {
      displayName,
      bio,
      showBio,
      age,
      gender,
      preferredGender,
      personalityPreferences,
      mood,
      showMood,
      moodDuration,
      language,
      saveChatHistory,
      interests,
      themePreference,
      avatarType,
      avatarEmoji,
      avatarData,
      avatarUrlPreset,
    } = body;

    // Sanitize basic fields
    const cleanDisplayName = displayName !== undefined ? displayName.trim().slice(0, 50) : undefined;
    const cleanBio = bio !== undefined ? bio.trim().slice(0, 500) : undefined;
    const cleanGender = gender !== undefined ? gender.trim() : undefined;

    // Strict Server-side VIP Protection (Triggers ONLY if active VIP values are passed)
    const isUpdatingVIPAvatarEmoji = avatarEmoji !== undefined && avatarEmoji !== '' && isVipAvatar(avatarEmoji);
    const isUpdatingVIPAvatarImage = (avatarData && avatarData.startsWith('data:image/')) || avatarType === 'IMAGE';
    const isUpdatingVIPPreferences = preferredGender !== undefined && preferredGender !== '' && preferredGender !== 'auto';
    const isUpdatingVIPMood = (mood !== undefined && mood !== '') || (moodDuration !== undefined && moodDuration !== '');
    const isUpdatingVIPPersonality = personalityPreferences !== undefined && personalityPreferences !== '';

    if ((isUpdatingVIPAvatarEmoji || isUpdatingVIPAvatarImage || isUpdatingVIPPreferences || isUpdatingVIPMood || isUpdatingVIPPersonality) && !isVIP) {
      return NextResponse.json(
        {
          error: 'Premium avatar collection, custom profile pictures, custom moods & targeted discovery preferences require CupidX VIP.',
          isVipRequired: true,
        },
        { status: 403 }
      );
    }

    let avatarUrl = avatarUrlPreset !== undefined ? avatarUrlPreset : undefined;

    if (isUpdatingVIPAvatarImage && isVIP && avatarData) {
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
    if (isVIP) {
      if (moodDuration === '1hour') {
        moodExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      } else if (moodDuration === '24hours') {
        moodExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      } else if (moodDuration === 'never') {
        moodExpiresAt = null;
      }
    }

    // Update User.displayName if provided
    if (cleanDisplayName) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          displayName: cleanDisplayName,
          fullName: cleanDisplayName,
        },
      });
    }

    // Update Profile record
    const updatedProfile = await prisma.profile.update({
      where: { userId: user.id },
      data: {
        bio: cleanBio !== undefined ? cleanBio : undefined,
        showBio: showBio !== undefined ? Boolean(showBio) : undefined,
        age: age !== undefined ? parseInt(age.toString(), 10) : undefined,
        gender: cleanGender !== undefined ? cleanGender : undefined,
        preferredGender: preferredGender !== undefined ? preferredGender : undefined,
        personalityPreferences: isVIP && personalityPreferences !== undefined ? personalityPreferences : undefined,
        mood: isVIP && mood !== undefined ? mood : undefined,
        showMood: showMood !== undefined ? Boolean(showMood) : undefined,
        moodExpiresAt: isVIP && moodExpiresAt !== undefined ? moodExpiresAt : undefined,
        language: language !== undefined ? language : undefined,
        saveChatHistory: saveChatHistory !== undefined ? Boolean(saveChatHistory) : undefined,
        interests: interests !== undefined ? interests : undefined,
        themePreference: themePreference !== undefined ? themePreference : undefined,
        avatarType: avatarType !== undefined ? avatarType : undefined,
        avatarEmoji: avatarEmoji !== undefined ? avatarEmoji : undefined,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      profile: updatedProfile,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
