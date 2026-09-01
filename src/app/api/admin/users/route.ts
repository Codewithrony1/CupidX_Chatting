import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    const sessionAuth = await auth().catch(() => null);
    const claims = sessionAuth?.sessionClaims as any;
    const clerkRole = claims?.metadata?.role || claims?.role || claims?.publicMetadata?.role;

    const isLocalAdminMode = process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production';
    const isAdmin = isLocalAdminMode || user?.role === 'ADMIN' || clerkRole === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const planFilter = (searchParams.get('plan') || 'all').toLowerCase();

    // 1. Fetch Local Database Users
    const localUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        profile: true,
        subscription: true,
      },
    });

    // 2. Fetch Clerk Users (if configured)
    let clerkUsersMap = new Map<string, any>();
    try {
      if (process.env.CLERK_SECRET_KEY) {
        const client = await clerkClient();
        const clerkResponse = await client.users.getUserList({ limit: 100 });
        if (clerkResponse && clerkResponse.data) {
          clerkResponse.data.forEach((u) => {
            if (u.id) clerkUsersMap.set(u.id, u);
            const email = u.emailAddresses?.[0]?.emailAddress;
            if (email) clerkUsersMap.set(email.toLowerCase(), u);
          });
        }
      }
    } catch (clerkErr) {
      console.warn('Clerk user list fetch notice (using local DB users):', clerkErr);
    }

    // 3. Merge Local DB + Clerk User Data
    let mergedUsers = localUsers.map((u) => {
      const clerkData = u.clerkUserId ? clerkUsersMap.get(u.clerkUserId) : (u.email ? clerkUsersMap.get(u.email.toLowerCase()) : null);
      const isVip = u.is_vip || u.membershipTier === 'VIP' || (u.subscription?.isActive === true && u.subscription?.plan === 'VIP');

      return {
        id: u.id,
        clerkUserId: u.clerkUserId || clerkData?.id || null,
        username: u.username || clerkData?.username || 'user',
        fullName: u.fullName || (clerkData ? `${clerkData.firstName || ''} ${clerkData.lastName || ''}`.trim() : u.username),
        displayName: u.displayName || u.fullName,
        email: u.email || clerkData?.emailAddresses?.[0]?.emailAddress || 'No Email',
        plan: isVip ? 'VIP' : 'FREE',
        is_vip: isVip,
        vip_expires_at: u.vip_expires_at,
        isSuspended: u.isSuspended,
        role: u.role,
        gender: u.profile?.gender || u.gender || 'unspecified',
        avatarUrl: u.profile?.avatarUrl || clerkData?.imageUrl || '/default-avatar.png',
        createdAt: u.createdAt,
      };
    });

    // 4. Apply Plan Filtering
    if (planFilter === 'vip') {
      mergedUsers = mergedUsers.filter((u) => u.is_vip);
    } else if (planFilter === 'free') {
      mergedUsers = mergedUsers.filter((u) => !u.is_vip);
    }

    // 5. Apply Search Filtering (by username, email, full name)
    if (search) {
      mergedUsers = mergedUsers.filter(
        (u) =>
          u.username.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          u.fullName.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ users: mergedUsers, totalCount: mergedUsers.length });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
