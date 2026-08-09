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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
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
    // 1. Check local JWT cookie token first for INSTANT zero-latency response (<1ms)
    if (req) {
      const cookieHeader = req.headers.get('cookie') || '';
      const cookieMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]*)/);
      const token = cookieMatch ? cookieMatch[1] : null;

      if (token) {
        const payload = verifyToken(token);
        if (payload) {
          const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            include: {
              profile: true,
              subscription: true,
            },
          });
          if (user && !user.isSuspended) return user;
        }
      }
    }

    // 2. Fallback to Clerk authentication if local token cookie is not present
    try {
      const clerkAuth = await auth();
      if (clerkAuth && clerkAuth.userId) {
        const user = await prisma.user.findUnique({
          where: { clerkUserId: clerkAuth.userId },
          include: {
            profile: true,
            subscription: true,
          },
        });
        if (user && !user.isSuspended) {
          return user;
        }
      }
    } catch (e) {
      // Clerk auth fallback
    }

    return null;
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return null;
  }
}
