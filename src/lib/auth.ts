import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { verifyFirebaseIdToken } from './firebaseAdmin';
import { auth as clerkAuth, currentUser as clerkCurrentUser } from '@clerk/nextjs/server';

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

export async function getCurrentUser(req?: Request) {
  try {
    // 1. Check Clerk session first (Primary Authentication in CupiDX Chat)
    try {
      const clerkData = await clerkAuth();
      if (clerkData && clerkData.userId) {
        let user = await prisma.user.findFirst({
          where: {
            OR: [
              { clerkUserId: clerkData.userId },
              { id: clerkData.userId },
              { firebaseUid: clerkData.userId },
            ],
          },
          include: {
            profile: true,
            subscription: true,
          },
        });

        if (!user) {
          // Provision user in local database if first login
          let clerkDetail = null;
          try {
            clerkDetail = await clerkCurrentUser();
          } catch (e) {}

          const email = clerkDetail?.primaryEmailAddress?.emailAddress || null;
          const fullName = clerkDetail?.fullName || clerkDetail?.username || clerkDetail?.firstName || 'User';
          const username = (clerkDetail?.username || (email ? email.split('@')[0] : `user_${clerkData.userId.slice(-5)}`))
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '');

          try {
            user = await prisma.user.create({
              data: {
                id: clerkData.userId,
                clerkUserId: clerkData.userId,
                username: username || `user_${Date.now().toString().slice(-4)}`,
                fullName,
                displayName: fullName,
                email,
                role: 'USER',
                membershipTier: 'FREE',
                profile: {
                  create: {
                    age: 18,
                    gender: 'unspecified',
                    bio: 'Hey there! I am using CupidX.',
                    avatarEmoji: '😊',
                  },
                },
              },
              include: {
                profile: true,
                subscription: true,
              },
            });
          } catch (createErr) {
            user = await prisma.user.findFirst({
              where: {
                OR: [
                  { clerkUserId: clerkData.userId },
                  { id: clerkData.userId },
                ],
              },
              include: {
                profile: true,
                subscription: true,
              },
            });
          }
        }

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
    } catch (clerkErr) {
      // Proceed to cookie/token fallbacks
    }

    // 2. Check x-clerk-user-id Header
    if (req) {
      const headerClerkId = req.headers.get('x-clerk-user-id');
      if (headerClerkId) {
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { clerkUserId: headerClerkId },
              { id: headerClerkId },
              { firebaseUid: headerClerkId },
            ],
          },
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

    // 3. Check local JWT cookie token
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

      // 4. Check Authorization Bearer Header (Firebase ID Token)
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.substring(7);
        const decoded = await verifyFirebaseIdToken(idToken);
        if (decoded && decoded.uid) {
          const user = await prisma.user.findFirst({
            where: {
              OR: [
                { firebaseUid: decoded.uid },
                ...(decoded.email ? [{ email: decoded.email }] : []),
              ],
            },
            include: {
              profile: true,
              subscription: true,
            },
          });

          if (user && !user.isSuspended) {
            if (!user.firebaseUid) {
              await prisma.user.update({
                where: { id: user.id },
                data: { firebaseUid: decoded.uid },
              });
              user.firebaseUid = decoded.uid;
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
