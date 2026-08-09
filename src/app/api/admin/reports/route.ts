import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const reports = await prisma.report.findMany({
      include: {
        reporter: {
          select: { id: true, username: true, fullName: true }
        },
        reported: {
          select: { id: true, username: true, fullName: true, isSuspended: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('Admin GET reports error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { reportId, status } = body;

    if (!reportId || !status) {
      return NextResponse.json({ error: 'reportId and status are required' }, { status: 400 });
    }

    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: { status }
    });

    return NextResponse.json({
      message: 'Report status updated successfully',
      report: updatedReport
    });
  } catch (error) {
    console.error('Admin PUT report error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
