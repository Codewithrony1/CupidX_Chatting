import { NextResponse } from 'next/server';
import { getCurrentUser, signToken } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return NextResponse.json({
      token,
      userId: user.id,
      username: user.username,
    });
  } catch (error) {
    console.error('Error generating auth token for socket:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
