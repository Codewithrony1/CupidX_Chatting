import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';

export async function GET(req: Request) {
  try {
    const { authorized } = await verifyAdminAccess(req);

    if (!authorized) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const planFilter = (searchParams.get('plan') || 'all').toLowerCase();

    // Fetch Database Users
    const localUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        profile: true,
        subscription: true,
      },
    });

    let mergedUsers = localUsers.map((u) => {
      const isVip = u.is_vip || u.membershipTier === 'VIP' || (u.subscription?.isActive === true && u.subscription?.plan === 'VIP');

      return {
        id: u.id,
        firebaseUid: u.firebaseUid,
        username: u.username || 'user',
        fullName: u.fullName || u.username,
        email: u.email || null,
        membershipTier: isVip ? 'VIP' : 'FREE',
        is_vip: isVip,
        vip_expires_at: u.vip_expires_at,
        isSuspended: u.isSuspended,
        createdAt: u.createdAt,
        profile: u.profile,
        subscription: u.subscription,
      };
    });

    // Apply Filters
    if (search) {
      mergedUsers = mergedUsers.filter(
        (u) =>
          u.username.toLowerCase().includes(search) ||
          (u.email && u.email.toLowerCase().includes(search)) ||
          u.fullName.toLowerCase().includes(search)
      );
    }

    if (planFilter === 'vip') {
      mergedUsers = mergedUsers.filter((u) => u.is_vip);
    } else if (planFilter === 'free') {
      mergedUsers = mergedUsers.filter((u) => !u.is_vip);
    }

    return NextResponse.json({ users: mergedUsers });
  } catch (error) {
    console.error('Error fetching admin users list:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
