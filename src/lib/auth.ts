import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { auth as clerkAuth, currentUser as clerkCurrentUser, clerkClient } from '@clerk/nextjs/server';

const JWT_SECRET = process.env.JWT_SECRET || 'cupidx_fallback_jwt_secret';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: string; username: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string; username: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: string };
  } catch (e) {
    return null;
  }
}

/**
 * Retrieve an existing user or safely provision a new user from Clerk.
 */
export async function getOrCreateUserFromClerk(clerkId: string) {
  if (!clerkId || typeof clerkId !== 'string') return null;
  const cleanId = clerkId.trim();
  if (!cleanId) return null;

  // 1. Check if user exists in database by clerkUserId, id, or firebaseUid
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { clerkUserId: cleanId },
        { id: cleanId },
        { firebaseUid: cleanId },
      ],
    },
    include: {
      profile: true,
      subscription: true,
    },
  });

  if (user) {
    if (!user.clerkUserId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { clerkUserId: cleanId },
        include: { profile: true, subscription: true },
      });
    }
    return user;
  }

  // 2. Fetch authoritative Clerk user details
  let clerkDetail: any = null;
  try {
    const client = await clerkClient();
    clerkDetail = await client.users.getUser(cleanId);
  } catch (err) {
    try {
      clerkDetail = await clerkCurrentUser();
    } catch (e) {}
  }

  const email =
    clerkDetail?.primaryEmailAddress?.emailAddress ||
    clerkDetail?.emailAddresses?.[0]?.emailAddress ||
    null;

  // Check if account already exists with this email address
  if (email) {
    const existingByEmail = await prisma.user.findFirst({
      where: { email },
      include: { profile: true, subscription: true },
    });

    if (existingByEmail) {
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { clerkUserId: cleanId },
        include: { profile: true, subscription: true },
      });
      return user;
    }
  }

  // 3. Provision new user in database with collision-free username
  const rawName =
    clerkDetail?.fullName ||
    (clerkDetail?.firstName ? `${clerkDetail.firstName} ${clerkDetail.lastName || ''}`.trim() : null) ||
    clerkDetail?.username ||
    'CupidX User';

  const baseUsername =
    (clerkDetail?.username || (email ? email.split('@')[0] : `user_${cleanId.slice(-5)}`))
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') || `user_${cleanId.slice(-5)}`;

  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const cleanUsername = `${baseUsername.slice(0, 15)}_${randomSuffix}`;

  try {
    user = await prisma.user.create({
      data: {
        id: cleanId,
        clerkUserId: cleanId,
        username: cleanUsername,
        fullName: rawName,
        displayName: rawName,
        email,
        role: 'USER',
        membershipTier: 'FREE',
        profile: {
          create: {
            age: 18,
            gender: 'unspecified',
            bio: 'Hey there! I am using CupidX.',
            avatarEmoji: '😊',
            avatarType: 'EMOJI',
          },
        },
      },
      include: {
        profile: true,
        subscription: true,
      },
    });
  } catch (createErr) {
    // In case of parallel race, look up existing
    user = await prisma.user.findFirst({
      where: {
        OR: [{ clerkUserId: cleanId }, { id: cleanId }],
      },
      include: {
        profile: true,
        subscription: true,
      },
    });
  }

  return user;
}

export async function getCurrentUser(req?: Request) {
  try {
    let resolvedClerkId: string | null = null;

    // 1. Check Clerk session first (Next.js server auth)
    try {
      const clerkData = await clerkAuth();
      if (clerkData && clerkData.userId) {
        resolvedClerkId = clerkData.userId;
      }
    } catch (clerkErr) {
      // Ignore and proceed to headers/cookies
    }

    // 2. Check x-clerk-user-id Header (Cross-domain & client sync)
    if (!resolvedClerkId && req) {
      const headerClerkId = req.headers.get('x-clerk-user-id');
      if (headerClerkId && headerClerkId.trim()) {
        resolvedClerkId = headerClerkId.trim();
      }
    }

    // 3. Check Authorization header (Bearer token)
    if (!resolvedClerkId && req) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const rawToken = authHeader.slice(7).trim();
        // A. Check local JWT
        const localPayload = verifyToken(rawToken);
        if (localPayload?.userId) {
          const user = await prisma.user.findUnique({
            where: { id: localPayload.userId },
            include: { profile: true, subscription: true },
          });
          if (user && !user.isSuspended) return user;
        }
        // B. Check Clerk JWT
        try {
          const decoded = jwt.decode(rawToken) as any;
          if (decoded?.sub) {
            resolvedClerkId = decoded.sub;
          }
        } catch (e) {}
      }
    }

    // 4. Check Clerk __session cookie
    if (!resolvedClerkId && req) {
      const cookieHeader = req.headers.get('cookie') || '';
      const sessionMatch = cookieHeader.match(/(?:^|;\s*)__session=([^;]*)/);
      if (sessionMatch) {
        try {
          const decodedSession = jwt.decode(sessionMatch[1]) as any;
          if (decodedSession?.sub) {
            resolvedClerkId = decodedSession.sub;
          }
        } catch (e) {}
      }
    }

    // 5. If Clerk user ID was resolved, get or provision user
    if (resolvedClerkId) {
      const user = await getOrCreateUserFromClerk(resolvedClerkId);
      if (user && !user.isSuspended) {
        // Auto-expire VIP/Premium if expired
        if (user.is_vip && user.vip_expires_at && new Date(user.vip_expires_at).getTime() <= Date.now()) {
          await prisma.user.update({
            where: { id: user.id },
            data: { is_vip: false, membershipTier: 'FREE' },
          });
          user.is_vip = false;
          user.membershipTier = 'FREE';
        }
        return user;
      }
    }

    // 6. Check local JWT cookie token
    if (req) {
      const cookieHeader = req.headers.get('cookie') || '';
      const cookieMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]*)/);
      const token = cookieMatch ? cookieMatch[1] : null;

      if (token) {
        const payload = verifyToken(token);
        if (payload && payload.userId) {
          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            include: {
              profile: true,
              subscription: true,
            },
          });

          if (user && !user.isSuspended) {
            if (user.is_vip && user.vip_expires_at && new Date(user.vip_expires_at).getTime() <= Date.now()) {
              await prisma.user.update({
                where: { id: user.id },
                data: { is_vip: false, membershipTier: 'FREE' },
              });
              user.is_vip = false;
              user.membershipTier = 'FREE';
            }
            return user;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('getCurrentUser error:', error);
    return null;
  }
}
