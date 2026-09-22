import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { clerkClient } from '@clerk/nextjs/server';

export async function GET(req: Request) {
  try {
    const { authorized } = await verifyAdminAccess(req);

    if (!authorized) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const planFilter = (searchParams.get('plan') || 'all').toLowerCase();

    // 1. Fetch local/remote database users
    const localUsers = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        profile: true,
        subscription: true,
      },
    });

    // 2. Fetch all registered users directly from Clerk Backend API
    let clerkUsers: any[] = [];
    try {
      const client = await clerkClient();
      const clerkRes = await client.users.getUserList({ limit: 100 });
      clerkUsers = clerkRes.data || [];
    } catch (clerkErr) {
      console.warn('[ADMIN:USERS] Could not fetch Clerk user list:', clerkErr);
    }

    // Index local users by clerkUserId and email
    const localByClerkId = new Map<string, typeof localUsers[0]>();
    const localByEmail = new Map<string, typeof localUsers[0]>();

    for (const u of localUsers) {
      if (u.clerkUserId) localByClerkId.set(u.clerkUserId, u);
      if (u.email) localByEmail.set(u.email.toLowerCase(), u);
    }

    const matchedClerkIds = new Set<string>();

    // 3. Process and enrich database users with live Clerk data
    const mergedUsers: any[] = localUsers.map((u) => {
      const clerkUserId = (u as { clerkUserId?: string | null }).clerkUserId ?? null;
      let matchedClerkUser: any = null;

      if (clerkUserId && clerkUsers.length > 0) {
        matchedClerkUser = clerkUsers.find((cu) => cu.id === clerkUserId);
      }
      if (!matchedClerkUser && u.email && clerkUsers.length > 0) {
        matchedClerkUser = clerkUsers.find((cu) =>
          cu.emailAddresses?.some((e: any) => e.emailAddress?.toLowerCase() === u.email?.toLowerCase())
        );
      }

      if (matchedClerkUser) {
        matchedClerkIds.add(matchedClerkUser.id);
      }

      const isVip =
        u.is_vip ||
        u.membershipTier === 'VIP' ||
        (u.subscription?.isActive === true && u.subscription?.plan === 'VIP') ||
        matchedClerkUser?.publicMetadata?.is_vip === true;

      const email =
        u.email ||
        matchedClerkUser?.primaryEmailAddress?.emailAddress ||
        matchedClerkUser?.emailAddresses?.[0]?.emailAddress ||
        null;

      const fullName =
        u.fullName ||
        [matchedClerkUser?.firstName, matchedClerkUser?.lastName].filter(Boolean).join(' ') ||
        u.username;

      const avatarUrl =
        u.profile?.avatarUrl ||
        matchedClerkUser?.imageUrl ||
        null;

      return {
        id: u.id,
        clerkUserId: clerkUserId || matchedClerkUser?.id || null,
        username: u.username || matchedClerkUser?.username || 'user',
        vipUsername: u.vipUsername || null,
        vipUsernameClaimedAt: u.vipUsernameClaimedAt || null,
        fullName,
        displayName: u.displayName || fullName,
        email,
        membershipTier: isVip ? 'VIP' : 'FREE',
        is_vip: isVip,
        vip_expires_at: u.vip_expires_at || matchedClerkUser?.publicMetadata?.vip_expires_at || null,
        isSuspended: u.isSuspended || Boolean(matchedClerkUser?.banned),
        role: u.role || 'USER',
        gender: u.gender || u.profile?.gender || 'unspecified',
        createdAt: u.createdAt,
        profile: u.profile,
        avatarUrl,
        avatarType: u.profile?.avatarType || (avatarUrl ? 'IMAGE' : null),
        subscription: u.subscription,
        source: matchedClerkUser ? 'CLERK_SYNCED' : 'DATABASE',
      };
    });

    // 4. Add Clerk users who haven't yet completed onboarding or synced to DB
    for (const cu of clerkUsers) {
      if (matchedClerkIds.has(cu.id)) continue;
      const primaryEmail =
        cu.primaryEmailAddress?.emailAddress ||
        cu.emailAddresses?.[0]?.emailAddress ||
        null;
      if (primaryEmail && localByEmail.has(primaryEmail.toLowerCase())) continue;

      const isVip = cu.publicMetadata?.is_vip === true;
      const fullName =
        [cu.firstName, cu.lastName].filter(Boolean).join(' ') ||
        cu.username ||
        'Clerk User';
      const username =
        cu.username ||
        primaryEmail?.split('@')[0] ||
        `user_${cu.id.slice(-6)}`;

      mergedUsers.push({
        id: cu.id,
        clerkUserId: cu.id,
        username,
        vipUsername: null,
        vipUsernameClaimedAt: null,
        fullName,
        displayName: fullName,
        email: primaryEmail,
        membershipTier: isVip ? 'VIP' : 'FREE',
        is_vip: isVip,
        vip_expires_at: cu.publicMetadata?.vip_expires_at || null,
        isSuspended: Boolean(cu.banned || cu.locked),
        role: 'USER',
        gender: 'unspecified',
        createdAt: new Date(cu.createdAt).toISOString(),
        profile: null,
        avatarUrl: cu.imageUrl || null,
        avatarType: cu.imageUrl ? 'IMAGE' : null,
        subscription: null,
        source: 'CLERK_ONLY',
      });
    }

    // Sort newest first
    mergedUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply Filters
    let filteredUsers = mergedUsers;
    if (search) {
      filteredUsers = filteredUsers.filter(
        (u) =>
          u.username.toLowerCase().includes(search) ||
          (u.email && u.email.toLowerCase().includes(search)) ||
          u.fullName.toLowerCase().includes(search) ||
          (u.clerkUserId && u.clerkUserId.toLowerCase().includes(search))
      );
    }

    if (planFilter === 'vip') {
      filteredUsers = filteredUsers.filter((u) => u.is_vip);
    } else if (planFilter === 'free') {
      filteredUsers = filteredUsers.filter((u) => !u.is_vip);
    }

    return NextResponse.json({
      users: filteredUsers,
      totalClerkUsers: clerkUsers.length,
      totalDatabaseUsers: localUsers.length,
      totalCombined: mergedUsers.length,
    });
  } catch (error) {
    console.error('Error fetching admin users list:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
