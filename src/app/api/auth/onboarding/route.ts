import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { usernameSchema } from '@/lib/validation/username';
import { signToken, getCurrentUser, getOrCreateUserFromClerk } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username query parameter is required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');

    const validation = usernameSchema.safeParse(cleanUsername);
    if (!validation.success) {
      return NextResponse.json({
        available: false,
        reason: validation.error.issues[0]?.message || 'Invalid username format',
      });
    }

    const existing = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
      },
    });

    if (existing) {
      return NextResponse.json({ available: false, reason: 'Username is already taken' });
    }

    return NextResponse.json({ available: true });
  } catch (error) {
    console.error('Check username error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { getAdminDb } from '@/lib/firebaseAdmin';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { displayName, dob, gender, avatarEmoji, clerkUserId } = body;

    let user = await getCurrentUser(req);
    if (!user) {
      const fallbackClerkId = clerkUserId || req.headers.get('x-clerk-user-id');
      if (fallbackClerkId) {
        user = await getOrCreateUserFromClerk(fallbackClerkId);
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    const cleanDisplayName = (displayName || '').trim();
    if (cleanDisplayName.length < 2 || cleanDisplayName.length > 50) {
      return NextResponse.json(
        { error: 'Please enter a valid full name (2 to 50 characters).' },
        { status: 400 }
      );
    }

    if (!dob) {
      return NextResponse.json({ error: 'Date of birth is required.' }, { status: 400 });
    }

    const parsedDob = new Date(dob);
    if (isNaN(parsedDob.getTime())) {
      return NextResponse.json({ error: 'Please enter a valid date of birth.' }, { status: 400 });
    }

    const today = new Date();
    if (parsedDob > today) {
      return NextResponse.json({ error: 'Date of birth cannot be in the future.' }, { status: 400 });
    }

    // Strict server-side age calculation (minimum 18 years old)
    let calculatedAge = today.getFullYear() - parsedDob.getFullYear();
    const m = today.getMonth() - parsedDob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < parsedDob.getDate())) {
      calculatedAge--;
    }

    if (calculatedAge < 18) {
      return NextResponse.json(
        { error: 'You must be at least 18 years old to join CupidX.' },
        { status: 400 }
      );
    }

    const validGenders = ['male', 'female', 'other', 'prefer_not_to_say'];
    const cleanGender = gender && validGenders.includes(gender.toString().trim().toLowerCase())
      ? gender.toString().trim().toLowerCase()
      : 'male';

    const selectedEmoji = avatarEmoji || '😊';

    // Update User & Profile in Prisma DB with Permanent Lock
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: cleanDisplayName,
        displayName: cleanDisplayName,
        gender: cleanGender,
        dob: parsedDob,
        genderDobLocked: true, // Permanent lock for identity
        profile: {
          upsert: {
            update: {
              avatarType: 'EMOJI',
              avatarEmoji: selectedEmoji,
              age: calculatedAge,
              gender: cleanGender,
              dob: parsedDob,
              ageGenderConfirmed: true, // Permanent lock
            },
            create: {
              avatarType: 'EMOJI',
              avatarEmoji: selectedEmoji,
              age: calculatedAge,
              gender: cleanGender,
              dob: parsedDob,
              ageGenderConfirmed: true, // Permanent lock
              bio: 'Hey there! I am using CupidX.',
            },
          },
        },
      },
      include: { profile: true, subscription: true },
    });

    const isVIP = updatedUser.membershipTier === 'VIP' || (updatedUser.subscription?.isActive === true && updatedUser.subscription?.plan === 'VIP');

    // Server-side non-blocking Firestore sync via Firebase Admin
    try {
      const adminDb = getAdminDb();
      if (adminDb) {
        const firestoreData = {
          fullName: cleanDisplayName,
          displayName: cleanDisplayName,
          gender: cleanGender,
          dateOfBirth: parsedDob.toISOString().slice(0, 10),
          profileCompleted: true,
          updatedAt: Date.now(),
          profile: {
            fullName: cleanDisplayName,
            displayName: cleanDisplayName,
            gender: cleanGender,
            dateOfBirth: parsedDob.toISOString().slice(0, 10),
            age: calculatedAge,
            avatarEmoji: selectedEmoji,
            avatarType: 'EMOJI',
            ageGenderConfirmed: true,
          },
        };
        const uids = Array.from(new Set([updatedUser.id, updatedUser.clerkUserId, updatedUser.firebaseUid])).filter(Boolean) as string[];
        Promise.all(uids.map((u) => adminDb.collection('users').doc(u).set(firestoreData, { merge: true }).catch(() => {}))).catch(() => {});
      }
    } catch (fsErr) {
      console.warn('Firestore server sync notice:', fsErr);
    }

    const token = signToken({
      userId: updatedUser.id,
      username: updatedUser.username,
      role: updatedUser.role,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Profile onboarded successfully',
      user: {
        id: updatedUser.id,
        clerkUserId: updatedUser.clerkUserId,
        username: updatedUser.username,
        fullName: updatedUser.fullName,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        role: updatedUser.role,
        membershipTier: isVIP ? 'VIP' : 'FREE',
        is_vip: isVIP,
        profileCompleted: true,
        profileLocked: true,
        profile: updatedUser.profile,
        subscription: updatedUser.subscription,
      },
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Onboarding save error:', error);
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 });
  }
}
