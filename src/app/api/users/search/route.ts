import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim().toLowerCase() || '';

    if (!query) {
      return NextResponse.json({ users: [] });
    }

    // Clean query (remove leading @ if provided)
    const cleanQuery = query.startsWith('@') ? query.slice(1) : query;

    if (cleanQuery.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Fetch matching non-suspended users excluding self
    const matchingUsers = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        isSuspended: false,
        username: {
          contains: cleanQuery,
        },
      },
      take: 10,
      select: {
        id: true,
        username: true,
        fullName: true,
        displayName: true,
        profile: {
          select: {
            avatarUrl: true,
            isOnline: true,
          },
        },
      },
    });

    const formatted = matchingUsers.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName || u.fullName,
      avatarUrl: u.profile?.avatarUrl || '/default-avatar.png',
      isOnline: u.profile?.isOnline || false,
    }));

    return NextResponse.json({ users: formatted });
  } catch (error) {
    console.error('Error searching usernames:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
