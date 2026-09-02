import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { isVipAvatar } from '@/lib/avatars';
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
    if (user.profile) {
      user.profile.mood = '';
      user.profile.moodExpiresAt = null;
    }
  }

  // Calculate remaining name changes today (max 4 per day)
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastChangeStr = user.profile?.nameChangesDate
    ? new Date(user.profile.nameChangesDate).toISOString().slice(0, 10)
    : null;

  const currentDayCount = lastChangeStr === todayStr ? (user.profile?.nameChangesCount ?? 0) : 0;
  const remainingNameChanges = Math.max(0, 4 - currentDayCount);

  return NextResponse.json({
    profile: {
      ...user.profile,
      nameChangesCount: currentDayCount,
      remainingNameChangesToday: remainingNameChanges,
      randomChatIntroSeen: user.profile?.randomChatIntroSeen ?? false,
    },
    subscription: user.subscription,
    membershipTier: user.membershipTier,
    is_vip: user.is_vip,
  });
}

export async function PUT(req: Request) {
  try {
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
      dob,
      dateOfBirth,
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
      randomChatIntroSeen,
    } = body;

    // Handle "Don't show again" persistent flag update
    if (randomChatIntroSeen !== undefined && Object.keys(body).length <= 2) {
      const updated = await prisma.profile.update({
        where: { userId: user.id },
        data: { randomChatIntroSeen: Boolean(randomChatIntroSeen) },
      });
      return NextResponse.json({ success: true, profile: updated });
    }

    // ─── 1. FREE vs VIP SERVER-SIDE FIELD LOCKS ──────────────────────────────
    const inputDob = dob || dateOfBirth;
    const existingDob = user.dob || user.profile?.dob;
    const existingGender = user.gender || user.profile?.gender;
    const existingBio = user.profile?.bio || '';

    // A. Free user trying to change DOB after already set
    if (inputDob && existingDob && !isVIP) {
      const newDobDate = new Date(inputDob).toISOString().slice(0, 10);
      const oldDobDate = new Date(existingDob).toISOString().slice(0, 10);
      if (newDobDate !== oldDobDate) {
        return NextResponse.json(
          {
            error: 'Date of Birth is locked for Free members. Upgrade to VIP to change your birth date.',
            isVipRequired: true,
          },
          { status: 403 }
        );
      }
    }

    // B. Free user trying to change Gender after already set
    if (gender && existingGender && existingGender !== 'unspecified' && !isVIP) {
      const cleanNewGender = gender.trim().toLowerCase();
      const cleanOldGender = existingGender.trim().toLowerCase();
      if (cleanNewGender !== cleanOldGender) {
        return NextResponse.json(
          {
            error: 'Gender is locked for Free members. Upgrade to VIP to change your gender.',
            isVipRequired: true,
          },
          { status: 403 }
        );
      }
    }

    // C. Free user trying to edit Bio
    if (bio !== undefined && !isVIP) {
      const cleanNewBio = bio.trim();
      if (cleanNewBio !== existingBio.trim()) {
        return NextResponse.json(
          {
            error: 'Bio customization is an exclusive CupidX VIP feature. Upgrade to VIP to write a custom bio.',
            isVipRequired: true,
          },
          { status: 403 }
        );
      }
    }

    // ─── 2. Display Name Change Limit: Max 4 per calendar day ─────────────────
    let cleanDisplayName: string | undefined = undefined;
    let nextNameChangesCount = user.profile?.nameChangesCount ?? 0;
    let nextNameChangesDate: Date | undefined = undefined;

    if (displayName !== undefined) {
      const trimmed = displayName.trim();

      if (trimmed.length < 2 || trimmed.length > 50) {
        return NextResponse.json(
          { error: 'Display name must be between 2 and 50 characters.' },
          { status: 400 }
        );
      }
      if (/<[^>]*>|script|javascript:/i.test(trimmed)) {
        return NextResponse.json(
          { error: 'Invalid characters in display name.' },
          { status: 400 }
        );
      }

      const currentName = user.displayName || user.fullName || user.username;
      if (trimmed !== currentName) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const lastChangeStr = user.profile?.nameChangesDate
          ? new Date(user.profile.nameChangesDate).toISOString().slice(0, 10)
          : null;

        const countToday = lastChangeStr === todayStr ? (user.profile?.nameChangesCount ?? 0) : 0;

        if (countToday >= 4) {
          return NextResponse.json(
            {
              error: "You have reached today's name change limit (4/4). You can change your name again tomorrow.",
              limitReached: true,
              remaining: 0,
            },
            { status: 429 }
          );
        }

        cleanDisplayName = trimmed;
        nextNameChangesCount = countToday + 1;
        nextNameChangesDate = new Date();
      }
    }

    // Sanitize VIP fields
    const cleanBio = isVIP && bio !== undefined ? bio.trim().slice(0, 500) : undefined;
    const cleanGender = gender !== undefined ? gender.trim().toLowerCase() : undefined;
    const parsedDob = inputDob ? new Date(inputDob) : undefined;

    // Strict VIP checks
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

    // Update User record
    const userUpdateData: any = {};
    if (cleanDisplayName) {
      userUpdateData.displayName = cleanDisplayName;
      userUpdateData.fullName = cleanDisplayName;
    }
    if (cleanGender && ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'].includes(cleanGender)) {
      if (isVIP || !existingGender || existingGender === 'unspecified') {
        userUpdateData.gender = cleanGender;
      }
    }
    if (parsedDob && !isNaN(parsedDob.getTime())) {
      if (isVIP || !existingDob) {
        userUpdateData.dob = parsedDob;
      }
    }

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: userUpdateData,
      });
    }

    // Update Profile record
    const profileUpdateData: any = {
      bio: cleanBio !== undefined ? cleanBio : undefined,
      showBio: showBio !== undefined ? Boolean(showBio) : undefined,
      gender: cleanGender !== undefined ? (isVIP || !existingGender || existingGender === 'unspecified' ? cleanGender : undefined) : undefined,
      dob: parsedDob && !isNaN(parsedDob.getTime()) ? (isVIP || !existingDob ? parsedDob : undefined) : undefined,
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
    };

    if (nextNameChangesDate) {
      profileUpdateData.nameChangesCount = nextNameChangesCount;
      profileUpdateData.nameChangesDate = nextNameChangesDate;
    }

    const updatedProfile = await prisma.profile.update({
      where: { userId: user.id },
      data: profileUpdateData,
    });

    const remainingNameChanges = Math.max(0, 4 - (updatedProfile.nameChangesCount ?? 0));

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        ...updatedProfile,
        remainingNameChangesToday: remainingNameChanges,
      },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
