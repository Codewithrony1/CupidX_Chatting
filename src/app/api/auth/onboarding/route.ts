import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { usernameSchema } from '@/lib/validation/username';
import { signToken, getCurrentUser, getOrCreateUserFromClerk, getAuthCookieOptions } from '@/lib/auth';

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

    let currentUserId: string | null = null;
    try {
      const u = await getCurrentUser(req);
      if (u) currentUserId = u.id;
    } catch {}

    const existing = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
        ...(currentUserId ? { NOT: { id: currentUserId } } : {}),
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

import { validateDob } from '@/lib/validation/dob';
import { MINIMUM_LEGAL_AGE, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '@/lib/config/policy';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      displayName,
      dob,
      gender,
      avatarEmoji,
      termsAccepted,
      privacyAcknowledged,
      ageConfirmed,
      randomChatAcknowledged,
      locationProcessingAcknowledged,
      marketingConsent,
    } = body;

    let user = await getCurrentUser(req);
    let clerkEmail: string | null = null;

    if (!user) {
      try {
        const { auth: clerkAuth, currentUser: clerkCurrentUser } = await import('@clerk/nextjs/server');
        const clerkSession = await clerkAuth();
        if (clerkSession?.userId) {
          const cUser = await clerkCurrentUser().catch(() => null);
          clerkEmail =
            cUser?.primaryEmailAddress?.emailAddress ||
            cUser?.emailAddresses?.[0]?.emailAddress ||
            null;

          const { getOrCreateUserFromClerk } = await import('@/lib/auth');
          try {
            user = await getOrCreateUserFromClerk(clerkSession.userId);
          } catch (clerkErr: any) {
            if (clerkErr?.isDeletionLocked) {
              return NextResponse.json(
                {
                  error:
                    'Your previous account was recently deleted. For security reasons, you can create a new CupidxChat account after the temporary 48-hour restriction expires.',
                  isDeletionLocked: true,
                  expiresAt: clerkErr.expiresAt,
                  remainingHours: clerkErr.remainingHours,
                },
                { status: 403 }
              );
            }
            throw clerkErr;
          }
        }
      } catch (e: any) {
        if (e?.isDeletionLocked) {
          return NextResponse.json(
            {
              error:
                'Your previous account was recently deleted. For security reasons, you can create a new CupidxChat account after the temporary 48-hour restriction expires.',
              isDeletionLocked: true,
              expiresAt: e.expiresAt,
              remainingHours: e.remainingHours,
            },
            { status: 403 }
          );
        }
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }

    // Check verified email against 48-hour deletion cooldown
    const checkEmail = user.email || clerkEmail;
    if (checkEmail) {
      const { checkDeletionLock } = await import('@/lib/deletionLock');
      const lockStatus = await checkDeletionLock(checkEmail);
      if (lockStatus.isLocked) {
        return NextResponse.json(
          {
            error:
              'Your previous account was recently deleted. For security reasons, you can create a new CupidxChat account after the temporary 48-hour restriction expires.',
            isDeletionLocked: true,
            expiresAt: lockStatus.expiresAt,
            remainingHours: lockStatus.remainingHours,
          },
          { status: 403 }
        );
      }
    }

    const cleanDisplayName = (displayName || '').trim();
    if (cleanDisplayName.length < 2 || cleanDisplayName.length > 50) {
      return NextResponse.json(
        { error: 'Please enter a valid full name (2 to 50 characters).' },
        { status: 400 }
      );
    }

    // Authoritative Server-side Username Validation
    const rawUsername = body.username ? String(body.username).trim().toLowerCase().replace(/^@/, '') : null;
    let finalUsername = user.username;

    if (rawUsername) {
      const usernameValidation = usernameSchema.safeParse(rawUsername);
      if (!usernameValidation.success) {
        return NextResponse.json(
          { error: usernameValidation.error.issues[0]?.message || 'Invalid username format (3-20 letters, numbers, or underscores).' },
          { status: 400 }
        );
      }

      const existingUserWithUsername = await prisma.user.findFirst({
        where: {
          username: rawUsername,
          NOT: { id: user.id },
        },
      });

      if (existingUserWithUsername) {
        return NextResponse.json(
          { error: 'Username is already taken. Please choose another username.' },
          { status: 400 }
        );
      }

      finalUsername = rawUsername;
    }

    // Authoritative Server-side Consent Validation
    if (!termsAccepted) {
      return NextResponse.json(
        { error: 'You must review and agree to the Terms & Conditions.' },
        { status: 400 }
      );
    }
    if (!privacyAcknowledged) {
      return NextResponse.json(
        { error: 'You must acknowledge that you have read and understood the Privacy Policy.' },
        { status: 400 }
      );
    }
    if (!ageConfirmed) {
      return NextResponse.json(
        { error: `You must confirm that you meet the minimum age requirement (${MINIMUM_LEGAL_AGE}+) to use CupidX.` },
        { status: 400 }
      );
    }
    if (!randomChatAcknowledged) {
      return NextResponse.json(
        { error: 'You must acknowledge that CupidX connects you with strangers for random chat.' },
        { status: 400 }
      );
    }
    if (!locationProcessingAcknowledged) {
      return NextResponse.json(
        { error: 'You must acknowledge technical processing of approximate country information as described in the Privacy Policy.' },
        { status: 400 }
      );
    }

    // Authoritative Server-side DOB & 18+ Age Validation
    const dobValidation = validateDob(dob);
    if (!dobValidation.valid) {
      return NextResponse.json(
        { error: dobValidation.error || 'Please enter a valid date of birth.' },
        { status: 400 }
      );
    }

    const parsedDob = dobValidation.dob!;
    const calculatedAge = dobValidation.age!;

    if (calculatedAge < MINIMUM_LEGAL_AGE) {
      return NextResponse.json(
        { error: `You must be at least ${MINIMUM_LEGAL_AGE} years old to use CupidX.` },
        { status: 400 }
      );
    }

    const validGenders = ['male', 'female', 'other', 'prefer_not_to_say'];
    const cleanGender = gender && validGenders.includes(gender.toString().trim().toLowerCase())
      ? gender.toString().trim().toLowerCase()
      : 'male';

    const selectedEmoji = avatarEmoji || '😊';
    const consentNow = new Date();

    // 1. Atomic Transaction: Update User, Upsert Profile, Upsert UserConsent
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          username: finalUsername,
          fullName: cleanDisplayName,
          displayName: cleanDisplayName,
          gender: cleanGender,
          dob: parsedDob,
          genderDobLocked: true, // Permanent lock for identity
          profileCompleted: true,
          profileLocked: true,
        },
        include: { profile: true, subscription: true, consent: true },
      }),
      prisma.profile.upsert({
        where: { userId: user.id },
        update: {
          avatarType: 'EMOJI',
          avatarEmoji: selectedEmoji,
          age: calculatedAge,
          gender: cleanGender,
          dob: parsedDob,
          ageGenderConfirmed: true, // Permanent lock
          profileCompleted: true,
          profileLocked: true,
        },
        create: {
          userId: user.id,
          avatarType: 'EMOJI',
          avatarEmoji: selectedEmoji,
          age: calculatedAge,
          gender: cleanGender,
          dob: parsedDob,
          ageGenderConfirmed: true, // Permanent lock
          profileCompleted: true,
          profileLocked: true,
          bio: 'Hey there! I am using CupidX.',
        },
      }),
      prisma.userConsent.upsert({
        where: { userId: user.id },
        update: {
          termsAccepted: true,
          termsAcceptedAt: consentNow,
          privacyAcknowledged: true,
          privacyAcknowledgedAt: consentNow,
          ageConfirmed: true,
          ageConfirmedAt: consentNow,
          randomChatAcknowledged: true,
          randomChatAcknowledgedAt: consentNow,
          locationProcessingAcknowledged: true,
          locationProcessingAcknowledgedAt: consentNow,
          marketingConsent: Boolean(marketingConsent),
          marketingConsentUpdatedAt: marketingConsent ? consentNow : null,
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
          consentTimestamp: consentNow,
        },
        create: {
          userId: user.id,
          termsAccepted: true,
          termsAcceptedAt: consentNow,
          privacyAcknowledged: true,
          privacyAcknowledgedAt: consentNow,
          ageConfirmed: true,
          ageConfirmedAt: consentNow,
          randomChatAcknowledged: true,
          randomChatAcknowledgedAt: consentNow,
          locationProcessingAcknowledged: true,
          locationProcessingAcknowledgedAt: consentNow,
          marketingConsent: Boolean(marketingConsent),
          marketingConsentUpdatedAt: marketingConsent ? consentNow : null,
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
          consentTimestamp: consentNow,
        },
      }),
    ]);

    const isVIP = updatedUser.membershipTier === 'VIP' || (updatedUser.subscription?.isActive === true && updatedUser.subscription?.plan === 'VIP');

    // 2. Save to Clerk User publicMetadata for permanent cross-session cloud persistence
    try {
      const targetClerkId = user.clerkUserId || user.id;
      if (targetClerkId) {
        const { clerkClient } = await import('@clerk/nextjs/server');
        const client = await clerkClient();
        await client.users.updateUserMetadata(targetClerkId, {
          publicMetadata: {
            profileCompleted: true,
            profileLocked: true,
            genderDobLocked: true,
            dob: parsedDob.toISOString().slice(0, 10),
            gender: cleanGender,
            fullName: cleanDisplayName,
            displayName: cleanDisplayName,
            avatarEmoji: selectedEmoji,
            termsVersion: CURRENT_TERMS_VERSION,
            privacyVersion: CURRENT_PRIVACY_VERSION,
          },
        });

        if (finalUsername) {
          await client.users.updateUser(targetClerkId, {
            username: finalUsername,
          }).catch((uErr: any) => {
            console.warn('[ONBOARDING] Clerk username update notice:', uErr?.message || uErr);
          });
        }
      }
    } catch (clerkSyncErr) {
      console.warn('Clerk metadata sync notice:', clerkSyncErr);
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
        consent: updatedUser.consent,
      },
    });

    response.cookies.set('token', token, getAuthCookieOptions(req, 30 * 24 * 60 * 60));

    return response;
  } catch (error: any) {
    console.error('Onboarding save error:', error);
    return NextResponse.json({ 
      error: error?.message || 'Failed to complete onboarding. Please try again.' 
    }, { status: 500 });
  }
}
