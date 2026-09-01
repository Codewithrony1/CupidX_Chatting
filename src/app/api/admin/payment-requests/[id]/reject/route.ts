import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getCurrentUser(req);
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { id } = await props.params;
    if (!id) {
      return NextResponse.json({ error: 'Payment request ID required' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = body.reason || 'Payment verification failed. Invalid screenshot or UTR.';

    const paymentRequest = await prisma.paymentRequest.findFirst({
      where: {
        OR: [{ id }, { requestId: id }],
      },
    });

    if (!paymentRequest) {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
    }

    const now = new Date();

    // 1. Mark request as rejected
    const updatedRequest = await prisma.paymentRequest.update({
      where: { id: paymentRequest.id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
        reviewedAt: now,
        reviewedBy: admin.username,
      },
    });

    // 2. Log Admin Action
    await prisma.adminLog.create({
      data: {
        adminUserId: admin.id,
        action: 'REJECT_PAYMENT_REQUEST',
        targetUserId: paymentRequest.userId,
        details: `Rejected payment request ${paymentRequest.requestId}. Reason: ${reason}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment request rejected.',
      request: updatedRequest,
    });
  } catch (error) {
    console.error('Error rejecting payment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
