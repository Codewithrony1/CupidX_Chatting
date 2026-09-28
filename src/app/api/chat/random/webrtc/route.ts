import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const chatSessionId = searchParams.get('chatSessionId');

    if (!chatSessionId) {
      return NextResponse.json({ error: 'chatSessionId is required' }, { status: 400 });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userAId !== user.id && session.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let allCandidates: any[] = [];
    try {
      allCandidates = JSON.parse(session.iceCandidates || '[]');
    } catch {
      allCandidates = [];
    }

    // Only return candidates sent by the OTHER peer
    const partnerCandidates = allCandidates.filter((c) => c.senderId !== user.id);

    return NextResponse.json({
      status: session.status,
      mode: session.mode,
      offerSdp: session.offerSdp ? JSON.parse(session.offerSdp) : null,
      answerSdp: session.answerSdp ? JSON.parse(session.answerSdp) : null,
      candidates: partnerCandidates,
      isOfferer: session.userAId === user.id,
    });
  } catch (error: any) {
    console.error('WebRTC signal GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch signaling state' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { chatSessionId, action, sdp, candidate } = body;

    if (!chatSessionId || !action) {
      return NextResponse.json({ error: 'chatSessionId and action are required' }, { status: 400 });
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userAId !== user.id && session.userBId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'offer') {
      await prisma.chatSession.update({
        where: { id: chatSessionId },
        data: { offerSdp: JSON.stringify(sdp) },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'answer') {
      await prisma.chatSession.update({
        where: { id: chatSessionId },
        data: { answerSdp: JSON.stringify(sdp) },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'ice' && candidate) {
      let list: any[] = [];
      try {
        list = JSON.parse(session.iceCandidates || '[]');
      } catch {
        list = [];
      }
      list.push({ ...candidate, senderId: user.id, timestamp: Date.now() });

      await prisma.chatSession.update({
        where: { id: chatSessionId },
        data: { iceCandidates: JSON.stringify(list) },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'restart') {
      await prisma.chatSession.update({
        where: { id: chatSessionId },
        data: { offerSdp: null, answerSdp: null, iceCandidates: '[]' },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('WebRTC signal POST error:', error);
    return NextResponse.json({ error: 'Failed to record signal' }, { status: 500 });
  }
}
