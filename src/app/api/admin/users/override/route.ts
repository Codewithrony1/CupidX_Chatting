import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const admin = await getCurrentUser(req);
    if (!admin || admin.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { userId, gender, dob, genderDobLocked, is_vip, isSuspended } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const parsedDob = dob ? new Date(dob) : undefined;
    const cleanGender = gender ? gender.toString().trim().toLowerCase() : undefined;

    // Update User record
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        gender: cleanGender !== undefined ? cleanGender : undefined,
        dob: parsedDob && !isNaN(parsedDob.getTime()) ? parsedDob : undefined,
        genderDobLocked: genderDobLocked !== undefined ? Boolean(genderDobLocked) : undefined,
        is_vip: is_vip !== undefined ? Boolean(is_vip) : undefined,
        membershipTier: is_vip !== undefined ? (is_vip ? 'VIP' : 'FREE') : undefined,
        isSuspended: isSuspended !== undefined ? Boolean(isSuspended) : undefined,
      },
    });

    // Also update Profile record for consistency
    await prisma.profile.update({
      where: { userId },
      data: {
        gender: cleanGender !== undefined ? cleanGender : undefined,
        dob: parsedDob && !isNaN(parsedDob.getTime()) ? parsedDob : undefined,
      },
    });

    // Log admin audit action
    await prisma.adminLog.create({
      data: {
        adminUserId: admin.id,
        action: 'EDIT_USER_PROFILE_OVERRIDE',
        targetUserId: userId,
        details: `Updated profile overrides (gender: ${cleanGender}, locked: ${genderDobLocked}, vip: ${is_vip})`,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'User profile override applied successfully.',
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error applying user override:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
