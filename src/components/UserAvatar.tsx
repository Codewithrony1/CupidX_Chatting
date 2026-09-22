'use client';

import React from 'react';

interface UserAvatarProps {
  user?: {
    username?: string;
    displayName?: string;
    fullName?: string;
    membershipTier?: string;
    is_vip?: boolean | number;
    isVIP?: boolean;
    avatarType?: string;
    avatarEmoji?: string;
    avatarUrl?: string | null;
    profile?: {
      avatarType?: string;
      avatarEmoji?: string;
      avatarUrl?: string | null;
    } | null;
    subscription?: {
      isActive?: boolean | number;
      plan?: string;
    } | null;
  } | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  alt?: string;
}

function UserAvatarComponent({ user, size = 'md', className = '', alt }: UserAvatarProps) {
  const isVIP = Boolean(
    user?.membershipTier === 'VIP' ||
    (user as any)?.is_vip ||
    (user as any)?.isVIP ||
    (user?.subscription?.isActive && user?.subscription?.plan === 'VIP')
  );

  const avatarType =
    user?.profile?.avatarType ||
    user?.avatarType ||
    ((user?.profile?.avatarUrl || user?.avatarUrl) ? 'IMAGE' : 'EMOJI');

  const avatarUrl = user?.profile?.avatarUrl || user?.avatarUrl || null;
  const avatarEmoji = user?.profile?.avatarEmoji || user?.avatarEmoji || '😊';

  // For VIP: show photo IF they selected IMAGE and have a photo URL. Otherwise show their selected emoji!
  const showImage = isVIP && avatarType === 'IMAGE' && Boolean(avatarUrl);

  const resolvedAlt =
    alt ||
    (user?.displayName || user?.fullName || user?.username
      ? `Profile picture for ${user.displayName || user.fullName || user.username}`
      : 'User avatar');

  const sizeClasses = {
    xs: 'w-7 h-7 text-sm rounded-lg',
    sm: 'w-8 h-8 text-base rounded-xl',
    md: 'w-10 h-10 text-xl rounded-2xl',
    lg: 'w-14 h-14 text-3xl rounded-2xl',
    xl: 'w-24 h-24 text-5xl rounded-3xl',
  };

  if (showImage) {
    return (
      <img
        src={avatarUrl!}
        alt={resolvedAlt}
        className={`${sizeClasses[size]} object-cover border border-pink-400/50 shadow-md shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={resolvedAlt}
      className={`${sizeClasses[size]} bg-gradient-to-tr from-pink-600/30 via-purple-600/30 to-rose-600/30 border border-pink-400/50 flex items-center justify-center select-none shadow-md shrink-0 ${className}`}
    >
      {avatarEmoji}
    </div>
  );
}

const UserAvatar = React.memo(UserAvatarComponent);
export default UserAvatar;
