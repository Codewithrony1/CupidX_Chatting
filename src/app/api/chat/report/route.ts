import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { targetUserId, reason } = await req.json();

    if (!targetUserId || !reason) {
      return NextResponse.json({ error: 'Missing targetUserId or reason' }, { status: 400 });
    }

    const report = await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedUserId: targetUserId,
        reason,
        status: 'PENDING',
      }
    });

    return NextResponse.json({
      message: 'Report submitted successfully',
      report,
    });
  } catch (error) {
    console.error('Report error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
