'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser, useClerk, useAuth as useClerkAuth, useSignIn, useSignUp } from '@clerk/nextjs';
import { calculateDobAge } from '@/lib/validation/dob';
import { isUserVip } from '@/lib/vipCommon';

export interface UserProfile {
  id: string;
  uid: string;
  clerkUserId?: string | null;
  username: string;
  usernameLower: string;
  fullName: string;
  displayName: string;
  email: string | null;
  role: 'USER' | 'ADMIN';
  membershipTier: 'FREE' | 'VIP' | string;
  is_vip: boolean;
  isVIP?: boolean;
  vipUsername?: string | null;
  vipUsernameClaimedAt?: string | null;
  vip_expires_at?: string | null;
  vip_started_at?: string | null;
  online: boolean;
  status: 'active' | 'suspended';
  profileCompleted: boolean;
  profileLocked?: boolean;
  genderDobLocked?: boolean;
  dateOfBirth?: string | null;
  gender: string;
  createdAt: number;
  updatedAt: number;
  profile: {
    bio: string;
    showBio?: boolean;
    dateOfBirth?: string | null;
    age: number;
    gender: string;
    showGender?: boolean;
    preferredGender?: string;
    personalityPreferences?: string;
    mood?: string;
    showMood?: boolean;
    moodExpiresAt?: string | null;
    language?: string;
    saveChatHistory?: boolean;
    interests: string;
    avatarType?: string;
    avatarEmoji?: string;
    avatarUrl?: string | null;
    themePreference: string;
    randomChatIntroSeen?: boolean;
    ageGenderConfirmed?: boolean;
    ageGenderChangesCount?: number;
    nameChangesCount?: number;
    profileCompleted?: boolean;
  };
  subscription?: {
    isActive: boolean;
    plan: string;
    endDate?: string;
  };
}

export type User = UserProfile;

interface AuthContextType {
  user: User | null;
  clerkUser: any | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: () => Promise<void>;
  signUpWithGoogle: () => Promise<void>;
  loginWithEmail: (emailOrUsername: string, pass: string) => Promise<void>;
  signUpWithEmail: (emailOrUsername: string, pass: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const clerk = useClerk();
  const { getToken } = useClerkAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  // Protect against duplicate initialization per user session
  const currentInitUidRef = useRef<string | null>(null);
  const isNavigatingRef = useRef<boolean>(false);

  /**
   * Evaluates if the user profile has completed first-time onboarding
   */
  const checkProfileCompletion = (u: User | null): boolean => {
    if (!u) return false;
    // Admins are exempt from mandatory dating onboarding
    if (u.role === 'ADMIN') return true;
    return Boolean(
      u.username &&
      !u.username.startsWith('user_') &&
      (u.profileCompleted ||
       u.profileLocked ||
       u.genderDobLocked ||
       u.profile?.profileCompleted ||
       u.profile?.ageGenderConfirmed ||
       ((u.dateOfBirth || u.profile?.dateOfBirth) && u.gender && u.gender !== 'unspecified' && (u.fullName || u.displayName)))
    );
  };

  /**
   * Initializes user profile from the canonical Clerk + Prisma backend (/api/auth/me)
   */
  const initializeUserSession = async (cUser?: any, forceRefresh = false): Promise<UserProfile | null> => {
    const activeClerkUser = cUser || clerkUser;
    const sessionKey = activeClerkUser?.id || (user?.id ? user.id : 'client_session');

    // Skip re-fetch only if same user AND not a forced refresh (e.g. after onboarding)
    if (!forceRefresh && currentInitUidRef.current === sessionKey && user) {
      return user;
    }
    currentInitUidRef.current = sessionKey;

    try {
      const email = activeClerkUser?.primaryEmailAddress?.emailAddress || null;
      const displayName = activeClerkUser?.fullName || activeClerkUser?.username || activeClerkUser?.firstName || 'User';

      // Obtain verified Clerk session token if available
      let token: string | null = null;
      try {
        token = await getToken().catch(() => null);
      } catch {}

      const authHeaders: Record<string, string> = {};
      if (activeClerkUser?.id) {
        authHeaders['x-clerk-user-id'] = activeClerkUser.id;
      }
      if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`;
      }

      // Canonical backend DB (Prisma/Supabase) is the authoritative profile source.
      const backendRes = await fetch('/api/auth/me', {
        headers: authHeaders,
        credentials: 'include',
      }).then((res) => (res.ok ? res.json() : null)).catch(() => null);

      const backendUser = backendRes?.user;

      if (!backendUser && !activeClerkUser) {
        currentInitUidRef.current = null;
        setUser(null);
        return null;
      }

      const isProfileDone = Boolean(
        backendUser &&
        backendUser.username &&
        !backendUser.username.startsWith('user_') &&
        (backendUser.profileCompleted ||
         backendUser.profileLocked ||
         backendUser.genderDobLocked ||
         backendUser.profile?.profileCompleted ||
         backendUser.profile?.ageGenderConfirmed ||
         (backendUser.dob && backendUser.gender && backendUser.gender !== 'unspecified' && backendUser.fullName))
      );

      const rawVipExpiresAt = backendUser?.vip_expires_at || null;
      const isVipActive = isUserVip(backendUser);

      const resolvedProfile: UserProfile = {
        id: backendUser?.id || activeClerkUser?.id || 'user',
        uid: activeClerkUser?.id || backendUser?.id || 'user',
        clerkUserId: activeClerkUser?.id || backendUser?.clerkUserId || null,
        username: backendUser?.username || '',
        usernameLower: (backendUser?.username || '').toLowerCase(),
        vipUsername: backendUser?.vipUsername || null,
        vipUsernameClaimedAt: backendUser?.vipUsernameClaimedAt || null,
        fullName: backendUser?.fullName || displayName,
        displayName: backendUser?.displayName || displayName,
        email: backendUser?.email || email,
        role: (backendUser?.role as any) || 'USER',
        membershipTier: isVipActive ? 'VIP' : 'FREE',
        is_vip: isVipActive,
        isVIP: isVipActive,
        vip_expires_at: rawVipExpiresAt,
        vip_started_at: backendUser?.vip_started_at || null,
        online: true,
        status: 'active' as const,
        profileCompleted: isProfileDone,
        profileLocked: isProfileDone,
        genderDobLocked: Boolean(backendUser?.genderDobLocked),
        dateOfBirth: backendUser?.dob || null,
        gender: backendUser?.gender || 'unspecified',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        profile: {
          bio: backendUser?.profile?.bio || 'Hey there! I am using CupidX.',
          age: backendUser?.dob ? calculateDobAge(backendUser.dob) : 18,
          dateOfBirth: backendUser?.dob || null,
          gender: backendUser?.gender || 'unspecified',
          themePreference: backendUser?.profile?.themePreference || 'purple',
          avatarType: backendUser?.profile?.avatarType || 'EMOJI',
          avatarEmoji: backendUser?.profile?.avatarEmoji || '😊',
          avatarUrl: backendUser?.profile?.avatarUrl || null,
          interests: backendUser?.profile?.interests || '',
          randomChatIntroSeen: backendUser?.profile?.randomChatIntroSeen ?? false,
          ageGenderConfirmed: Boolean(backendUser?.profile?.ageGenderConfirmed || backendUser?.genderDobLocked),
        },
        subscription: backendUser?.subscription || {
          isActive: false,
          plan: 'FREE',
        },
      };

      setUser(resolvedProfile);
      return resolvedProfile;
    } catch (err) {
      console.error('[AUTH] Profile load error:', err);
      return null;
    }
  };

  const refreshUser = useCallback(async () => {
    currentInitUidRef.current = null;
    await initializeUserSession(clerkUser, true);
  }, [clerkUser]);

  // ─── 1. Handle User Session Initialization on Mount & State Changes ─────────
  useEffect(() => {
    initializeUserSession(clerkUser).finally(() => {
      setLoading(false);
    });
  }, [isLoaded, isSignedIn, clerkUser]);

  // ─── 1b. Window focus & visibility revalidation for instant VIP sync ───────
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    const handleRevalidate = () => {
      currentInitUidRef.current = null;
      initializeUserSession(clerkUser);
    };

    window.addEventListener('focus', handleRevalidate);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRevalidate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleRevalidate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isSignedIn, clerkUser]);

  // ─── 2. Route Guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || loading) return;

    // Dedicated admin panel routes running in localhost ADMIN_MODE must never be redirected by dating onboarding guards
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return;
    }

    const publicPaths = [
      '/',
      '/login',
      '/register',
      '/signup',
      '/sign-in',
      '/sign-up',
      '/privacy',
      '/terms',
      '/safety',
      '/community-guidelines',
      '/refund',
      '/contact',
      '/sso-callback',
      '/auth-callback',
      '/forgot-password',
    ];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const isAuthed = Boolean(user || (isSignedIn && clerkUser));

    // Unauthenticated user on protected route -> redirect to /login
    if (!isAuthed && !isPublic) {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      console.log('[AUTH GUARD] Unauthenticated user on protected route -> redirecting to /login');
      router.replace('/login');
      setTimeout(() => { isNavigatingRef.current = false; }, 500);
      return;
    }

    // Authenticated user routing
    if (isAuthed) {
      const isComplete = checkProfileCompletion(user);

      const isAuthPage = [
        '/login',
        '/register',
        '/signup',
        '/sign-in',
        '/sign-up',
      ].some((p) => pathname === p || pathname.startsWith(p + '/'));

      const isSetupProfilePage = pathname === '/setup-profile' || pathname === '/onboarding';

      // Authenticated user visits sign-in / sign-up auth page -> route by profile state
      if (isAuthPage) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        const target = isComplete ? '/dashboard' : '/setup-profile';
        console.log('[AUTH GUARD] Authenticated user on auth page -> redirecting to:', target);
        router.replace(target);
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Authenticated user with completed profile visits /setup-profile -> redirect to /dashboard
      if (isSetupProfilePage && isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        console.log('[AUTH GUARD] Profile already complete on setup-profile -> redirecting to /dashboard');
        router.replace('/dashboard');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Authenticated user with incomplete profile visits /chat or any protected route (other than /setup-profile) -> redirect to /setup-profile
      // IMPORTANT: Only redirect if user object is loaded (not null) - prevents redirect loop on fresh dashboard load
      if (!isPublic && !isSetupProfilePage && !isComplete && user !== null) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        console.log('[AUTH GUARD] Incomplete profile on protected route -> redirecting to /setup-profile');
        router.replace('/setup-profile');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }
    }
  }, [isLoaded, loading, isSignedIn, clerkUser, user, pathname, router]);

  // ─── 3. Google 1-Click Sign-in via Clerk ────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    console.log('[AUTH] Clerk Google login initiated');

    // 1. Primary: Use signIn.sso() — Clerk v7 Future API
    if (signIn?.sso) {
      try {
        const { error } = await signIn.sso({
          strategy: 'oauth_google',
          redirectUrl: '/auth-callback',
          redirectCallbackUrl: '/sso-callback',
        });
        if (error) {
          console.warn('[AUTH] signIn.sso error:', error);
        }
        return;
      } catch (ssoErr: any) {
        console.warn('[AUTH] signIn.sso notice:', ssoErr);
      }
    }

    // 2. Fallback: clerk.authenticateWithRedirect
    if (clerk && typeof (clerk as any).authenticateWithRedirect === 'function') {
      try {
        await (clerk as any).authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/auth-callback',
          continueSignUpUrl: '/setup-profile',
        });
        return;
      } catch (authErr: any) {
        console.warn('[AUTH] clerk.authenticateWithRedirect notice:', authErr);
      }
    }

    // 3. Fallback: Open Clerk Sign-In modal
    if (clerk?.openSignIn) {
      try {
        clerk.openSignIn({
          fallbackRedirectUrl: '/auth-callback',
          signUpFallbackRedirectUrl: '/auth-callback',
        });
        return;
      } catch (modalErr) {
        console.warn('[AUTH] openSignIn modal notice:', modalErr);
      }
    }

    // 4. Last resort: clerk.redirectToSignIn
    if (clerk && typeof (clerk as any).redirectToSignIn === 'function') {
      await (clerk as any).redirectToSignIn({
        fallbackRedirectUrl: '/auth-callback',
        signUpFallbackRedirectUrl: '/auth-callback',
      });
    }
  }, [signIn, clerk]);

  const signUpWithGoogle = useCallback(async () => {
    console.log('[AUTH] Clerk Google signup initiated');

    // 1. Primary: Use signUp.sso() — Clerk v7 Future API
    if (signUp?.sso) {
      try {
        const { error } = await signUp.sso({
          strategy: 'oauth_google',
          redirectUrl: '/auth-callback',
          redirectCallbackUrl: '/sso-callback',
        });
        if (error) {
          console.warn('[AUTH] signUp.sso error:', error);
        }
        return;
      } catch (ssoErr: any) {
        console.warn('[AUTH] signUp.sso notice:', ssoErr);
      }
    }

    // 2. Secondary: Try signIn.sso() (auto-transfers)
    if (signIn?.sso) {
      try {
        const { error } = await signIn.sso({
          strategy: 'oauth_google',
          redirectUrl: '/auth-callback',
          redirectCallbackUrl: '/sso-callback',
        });
        if (error) {
          console.warn('[AUTH] signIn.sso error:', error);
        }
        return;
      } catch (ssoErr: any) {
        console.warn('[AUTH] signIn.sso notice:', ssoErr);
      }
    }

    // 3. Fallback: clerk.authenticateWithRedirect
    if (clerk && typeof (clerk as any).authenticateWithRedirect === 'function') {
      try {
        await (clerk as any).authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/auth-callback',
          continueSignUpUrl: '/setup-profile',
        });
        return;
      } catch (authErr: any) {
        console.warn('[AUTH] clerk.authenticateWithRedirect notice:', authErr);
      }
    }

    // 4. Fallback: Open Clerk Sign-Up modal
    if (clerk?.openSignUp) {
      try {
        clerk.openSignUp({
          fallbackRedirectUrl: '/auth-callback',
        });
        return;
      } catch (modalErr) {
        console.warn('[AUTH] openSignUp modal notice:', modalErr);
      }
    }

    // 5. Last resort: clerk.redirectToSignUp
    if (clerk && typeof (clerk as any).redirectToSignUp === 'function') {
      await (clerk as any).redirectToSignUp({
        fallbackRedirectUrl: '/auth-callback',
      });
    }
  }, [signUp, signIn, clerk]);

  // ─── 4. Email / Password Login via Native API ──────────────────────────────
  const loginWithEmail = useCallback(async (emailOrUsername: string, pass: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ identifier: emailOrUsername.trim(), password: pass }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Invalid username/email or password.');
      }

      // After login, fetch fresh user profile from /api/auth/me (cookie was just set)
      // Use initializeUserSession with current clerkUser if present, otherwise fetch directly
      currentInitUidRef.current = null;
      let profile: UserProfile | null = null;

      if (clerkUser) {
        // Clerk-based session: use the normal flow
        profile = await initializeUserSession(clerkUser, true);
      } else {
        // Native DB session: fetch /api/auth/me directly with the new cookie
        try {
          const meRes = await fetch('/api/auth/me', {
            credentials: 'include',
          });
          const meData = meRes.ok ? await meRes.json() : null;
          const backendUser = meData?.user;

          if (backendUser) {
            const isProfileDone = Boolean(
              backendUser.username &&
              !backendUser.username.startsWith('user_') &&
              (backendUser.profileCompleted ||
               backendUser.profileLocked ||
               backendUser.genderDobLocked ||
               backendUser.profile?.profileCompleted ||
               backendUser.profile?.ageGenderConfirmed)
            );
            const isVipActive = isUserVip(backendUser);
            profile = {
              id: backendUser.id,
              uid: backendUser.id,
              clerkUserId: backendUser.clerkUserId || null,
              username: backendUser.username || '',
              usernameLower: (backendUser.username || '').toLowerCase(),
              vipUsername: backendUser.vipUsername || null,
              vipUsernameClaimedAt: backendUser.vipUsernameClaimedAt || null,
              fullName: backendUser.fullName || emailOrUsername,
              displayName: backendUser.displayName || backendUser.fullName || emailOrUsername,
              email: backendUser.email || null,
              role: backendUser.role || 'USER',
              membershipTier: isVipActive ? 'VIP' : 'FREE',
              is_vip: isVipActive,
              isVIP: isVipActive,
              vip_expires_at: backendUser.vip_expires_at || null,
              vip_started_at: backendUser.vip_started_at || null,
              online: true,
              status: 'active' as const,
              profileCompleted: isProfileDone,
              profileLocked: isProfileDone,
              genderDobLocked: Boolean(backendUser.genderDobLocked),
              dateOfBirth: backendUser.dob || null,
              gender: backendUser.gender || 'unspecified',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              profile: {
                bio: backendUser.profile?.bio || 'Hey there! I am using CupidX.',
                age: backendUser.dob ? calculateDobAge(backendUser.dob) : 18,
                dateOfBirth: backendUser.dob || null,
                gender: backendUser.gender || 'unspecified',
                themePreference: backendUser.profile?.themePreference || 'purple',
                avatarType: backendUser.profile?.avatarType || 'EMOJI',
                avatarEmoji: backendUser.profile?.avatarEmoji || '😊',
                avatarUrl: backendUser.profile?.avatarUrl || null,
                interests: backendUser.profile?.interests || '',
                randomChatIntroSeen: backendUser.profile?.randomChatIntroSeen ?? false,
                ageGenderConfirmed: Boolean(backendUser.profile?.ageGenderConfirmed || backendUser.genderDobLocked),
              },
              subscription: backendUser.subscription || { isActive: false, plan: 'FREE' },
            };
            setUser(profile);
          }
        } catch (meErr) {
          console.error('[AUTH] /api/auth/me fetch after login failed:', meErr);
        }
      }

      if (profile && checkProfileCompletion(profile)) {
        router.replace('/dashboard');
      } else {
        router.replace('/setup-profile');
      }
    } catch (err: any) {
      console.error('[AUTH] Login error:', err);
      throw new Error(err.message || 'Invalid username/email or password.');
    }
  }, [router, clerkUser]);

  // ─── 5. Email / Password Signup via Native API ─────────────────────────────
  const signUpWithEmail = useCallback(async (emailOrUsername: string, pass: string, name?: string) => {
    try {
      const cleanId = emailOrUsername.trim();
      const isEmail = cleanId.includes('@');
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fullName: name?.trim() || (isEmail ? cleanId.split('@')[0] : cleanId),
          username: cleanId,
          email: isEmail ? cleanId : undefined,
          password: pass,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not complete registration.');
      }

      currentInitUidRef.current = null;
      await initializeUserSession(undefined, true);
      router.replace('/setup-profile');
    } catch (err: any) {
      console.error('[AUTH] Signup error:', err);
      throw new Error(err.message || 'Could not complete registration.');
    }
  }, [router]);

  // ─── 6. Logout ─────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});

      setUser(null);
      currentInitUidRef.current = null;

      if (clerk && isSignedIn) {
        await clerk.signOut().catch(() => {});
      }
      router.replace('/login');
    } catch (e) {
      console.error('[AUTH] Logout error:', e);
      router.replace('/login');
    }
  }, [clerk, isSignedIn, router]);

  const isAuthenticated = Boolean(user || (isSignedIn && clerkUser));

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      clerkUser,
      loading: !isLoaded || loading,
      isAuthenticated,
      loginWithGoogle,
      signUpWithGoogle,
      loginWithEmail,
      signUpWithEmail,
      logout,
      refreshUser,
    }),
    [
      user,
      clerkUser,
      isLoaded,
      loading,
      isAuthenticated,
      loginWithGoogle,
      signUpWithGoogle,
      loginWithEmail,
      signUpWithEmail,
      logout,
      refreshUser,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
