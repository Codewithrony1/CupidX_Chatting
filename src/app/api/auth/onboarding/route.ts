import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { usernameSchema } from '@/lib/validation/username';
import { signToken, getCurrentUser } from '@/lib/auth';

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { username, displayName: inputDisplayName, avatarEmoji: inputAvatarEmoji, age: inputAge, gender: inputGender, dob: inputDob, email: inputEmail } = body;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    const cleanDisplayName = (inputDisplayName || '').trim() || cleanUsername;
    const selectedEmoji = inputAvatarEmoji || '😊';
    const cleanGender = inputGender ? inputGender.toString().trim().toLowerCase() : 'unspecified';
    const parsedDob = inputDob ? new Date(inputDob) : null;
    
    let parsedAge = 18;
    if (parsedDob && !isNaN(parsedDob.getTime())) {
      const today = new Date();
      let calculatedAge = today.getFullYear() - parsedDob.getFullYear();
      const m = today.getMonth() - parsedDob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < parsedDob.getDate())) {
        calculatedAge--;
      }
      parsedAge = Math.min(99, Math.max(18, calculatedAge));
    } else if (inputAge) {
      parsedAge = Math.min(99, Math.max(18, parseInt(inputAge.toString(), 10)));
    }

    const validation = usernameSchema.safeParse(cleanUsername);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || 'Invalid username format' },
        { status: 400 }
      );
    }

    let user = await getCurrentUser(req);



    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    if (user.username !== cleanUsername) {
      const taken = await prisma.user.findFirst({
        where: { username: cleanUsername, id: { not: user.id } },
      });

      if (taken) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
      }
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        username: cleanUsername,
        displayName: cleanDisplayName,
        fullName: cleanDisplayName,
        gender: cleanGender,
        dob: parsedDob && !isNaN(parsedDob.getTime()) ? parsedDob : undefined,
        email: inputEmail ? inputEmail.trim() : user.email,
        profile: {
          upsert: {
            update: {
              avatarType: 'EMOJI',
              avatarEmoji: selectedEmoji,
              age: parsedAge,
              gender: cleanGender,
              dob: parsedDob && !isNaN(parsedDob.getTime()) ? parsedDob : undefined,
              ageGenderConfirmed: true,
            },
            create: {
              avatarType: 'EMOJI',
              avatarEmoji: selectedEmoji,
              age: parsedAge,
              gender: cleanGender,
              dob: parsedDob && !isNaN(parsedDob.getTime()) ? parsedDob : undefined,
              ageGenderConfirmed: true,
              bio: 'Hey there! I am using Cupidx.',
            },
          },
        },
      },
      include: { profile: true, subscription: true },
    });

    const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');
    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      message: 'Profile onboarded successfully',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        membershipTier: isVIP ? 'VIP' : 'FREE',
        is_vip: isVIP,
        profile: user.profile,
        subscription: user.subscription,
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
