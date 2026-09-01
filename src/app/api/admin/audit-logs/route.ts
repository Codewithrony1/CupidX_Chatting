import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request) {
  try {
    const admin = await getCurrentUser(req);
    const sessionAuth = await auth().catch(() => null);
    const claims = sessionAuth?.sessionClaims as any;
    const clerkRole = claims?.metadata?.role || claims?.role || claims?.publicMetadata?.role;

    const isLocalAdminMode = process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production';
    const isAdmin = isLocalAdminMode || admin?.role === 'ADMIN' || clerkRole === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const logs = await prisma.adminLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        admin: {
          select: {
            username: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
