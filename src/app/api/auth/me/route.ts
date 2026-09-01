import { NextResponse } from 'next/server';
import { getCurrentUser, signToken } from '@/lib/auth';
import { verifyFirebaseIdToken } from '@/lib/firebaseAdmin';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    let user: any = await getCurrentUser(req);

    // If not found via cookie, check Authorization header (Firebase ID token)
    if (!user) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const idToken = authHeader.substring(7);
        const decoded = await verifyFirebaseIdToken(idToken);

        if (decoded && decoded.uid) {
          user = await prisma.user.findFirst({
            where: {
              OR: [
                { firebaseUid: decoded.uid },
                ...(decoded.email ? [{ email: decoded.email }] : []),
              ],
            },
            include: { profile: true, subscription: true },
          });

          // Auto-provision user if first time logging in
          if (!user) {
            const email = decoded.email || '';
            const rawName = decoded.name || (email ? email.split('@')[0] : '') || `user_${decoded.uid.slice(-6)}`;
            let cleanUsername = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '');
            if (cleanUsername.length < 3) cleanUsername = `user_${Date.now().toString().slice(-4)}`;

            const existing = await prisma.user.findFirst({
              where: { username: cleanUsername },
            });

            const finalUsername = existing ? `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}` : cleanUsername;
            const displayName = decoded.name || finalUsername;

            user = await prisma.user.create({
              data: {
                firebaseUid: decoded.uid,
                email: email || null,
                username: finalUsername,
                fullName: displayName,
                displayName: displayName,
                passwordHash: '',
                role: 'USER',
                membershipTier: 'FREE',
                profile: {
                  create: {
                    avatarType: decoded.picture ? 'IMAGE' : 'EMOJI',
                    avatarEmoji: '😊',
                    avatarUrl: decoded.picture || null,
                    bio: 'Hey there! I am using Cupidx.',
                  },
                },
                subscription: {
                  create: {
                    plan: 'FREE',
                    isActive: false,
                    subscriptionStatus: 'INACTIVE',
                  },
                },
              },
              include: { profile: true, subscription: true },
            });
          } else if (!user.firebaseUid) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { firebaseUid: decoded.uid },
              include: { profile: true, subscription: true },
            });
          }
        }
      }
    }

    if (user) {
      const isVIP = user.membershipTier === 'VIP' || (user.subscription?.isActive === true && user.subscription?.plan === 'VIP');
      const token = signToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      const response = NextResponse.json({
        user: {
          id: user.id,
          firebaseUid: user.firebaseUid,
          username: user.username,
          fullName: user.fullName,
          displayName: user.displayName || user.fullName,
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
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
