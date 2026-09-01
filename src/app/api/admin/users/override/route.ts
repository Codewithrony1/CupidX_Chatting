import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
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

    const updateData: any = {};
    if (cleanGender !== undefined) updateData.gender = cleanGender;
    if (parsedDob && !isNaN(parsedDob.getTime())) updateData.dob = parsedDob;
    if (genderDobLocked !== undefined) updateData.genderDobLocked = Boolean(genderDobLocked);
    if (isSuspended !== undefined) updateData.isSuspended = Boolean(isSuspended);

    if (is_vip !== undefined) {
      const vipBool = Boolean(is_vip);
      updateData.is_vip = vipBool;
      updateData.membershipTier = vipBool ? 'VIP' : 'FREE';
      if (vipBool && (!targetUser.vip_expires_at || new Date(targetUser.vip_expires_at) <= new Date())) {
        updateData.vip_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else if (!vipBool) {
        updateData.vip_expires_at = null;
      }
    }

    // Update User record safely
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Update Profile record for consistency if profile fields changed
    const profileUpdate: any = {};
    if (cleanGender !== undefined) profileUpdate.gender = cleanGender;
    if (parsedDob && !isNaN(parsedDob.getTime())) profileUpdate.dob = parsedDob;

    if (Object.keys(profileUpdate).length > 0) {
      await prisma.profile.update({
        where: { userId },
        data: profileUpdate,
      });
    }

    // Log admin audit action
    if (admin?.id) {
      await prisma.adminLog.create({
        data: {
          adminUserId: admin.id,
          adminClerkId: claims?.sub || null,
          action: 'EDIT_USER_PROFILE_OVERRIDE',
          targetUserId: userId,
          details: `Updated profile overrides for @${targetUser.username}`,
        },
      });
    }

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
