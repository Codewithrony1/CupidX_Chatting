import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { auth } from '@clerk/nextjs/server';

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
    // 1. Check Clerk session first if present
    let clerkAuth: any = null;
    try {
      clerkAuth = await auth();
    } catch (e) {}

    if (clerkAuth && clerkAuth.userId) {
      let user = await prisma.user.findUnique({
        where: { clerkUserId: clerkAuth.userId },
        include: {
          profile: true,
          subscription: true,
        },
      });

      if (user && !user.isSuspended) {
        // Auto-downgrade ONLY if an expiry date is set AND has passed
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

    // 2. Check local JWT cookie token if Clerk user wasn't directly found
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
            // Auto-link clerkUserId if current session has clerkAuth
            if (clerkAuth && clerkAuth.userId && !user.clerkUserId) {
              await prisma.user.update({
                where: { id: user.id },
                data: { clerkUserId: clerkAuth.userId },
              });
              user.clerkUserId = clerkAuth.userId;
            }

            // Auto-downgrade ONLY if an expiry date is set AND has passed
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
