'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser, useClerk, useAuth as useClerkAuth } from '@clerk/nextjs';
import {
  getOrCreateFirestoreUser,
  updateFirestoreUserProfile,
  setFirestoreUserPresence,
  calculateAge,
  type UserProfile,
} from '@/lib/firestoreUser';

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
    return Boolean(
      u.profileCompleted === true ||
      u.profileLocked === true ||
      u.genderDobLocked === true ||
      u.profile?.ageGenderConfirmed === true ||
      ((u.dateOfBirth || u.profile?.dateOfBirth) && u.gender && u.gender !== 'unspecified' && (u.fullName || u.displayName))
    );
  };

  /**
   * Initializes user profile by syncing canonical backend user (/api/auth/me) and Firestore
   */
  const initializeUserSession = async (cUser: any): Promise<UserProfile | null> => {
    if (!cUser) {
      currentInitUidRef.current = null;
      setUser(null);
      return null;
    }

    if (currentInitUidRef.current === cUser.id && user) {
      return user;
    }
    currentInitUidRef.current = cUser.id;

    console.log('[AUTH] Clerk Profile initialization for ID:', cUser.id);
    try {
      const email = cUser.primaryEmailAddress?.emailAddress || null;
      const displayName = cUser.fullName || cUser.username || cUser.firstName || 'User';
      const photoURL = cUser.imageUrl || null;

      // Obtain verified Clerk session token if available
      const token = await getToken().catch(() => null);
      const authHeaders: Record<string, string> = {
        'x-clerk-user-id': cUser.id,
      };
      if (token) {
        authHeaders['Authorization'] = `Bearer ${token}`;
      }

      // Parallel fetch: Canonical backend DB (/api/auth/me) + Firestore document
      const [backendRes, firestoreProfile] = await Promise.all([
        fetch('/api/auth/me', {
          headers: authHeaders,
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        getOrCreateFirestoreUser({
          uid: cUser.id,
          displayName,
          email,
          photoURL,
        }).catch(() => null),
      ]);

      const backendUser = backendRes?.user;

      const baseProfile: UserProfile = firestoreProfile || {
        id: cUser.id,
        uid: cUser.id,
        clerkUserId: cUser.id,
        firebaseUid: cUser.id,
        username: cUser.username || `user_${cUser.id.slice(-5)}`,
        usernameLower: (cUser.username || `user_${cUser.id.slice(-5)}`).toLowerCase(),
        fullName: displayName,
        displayName: displayName,
        email,
        role: 'USER' as const,
        membershipTier: 'FREE',
        is_vip: false,
        isVIP: false,
        online: true,
        status: 'active' as const,
        profileCompleted: false,
        profileLocked: false,
        genderDobLocked: false,
        dateOfBirth: null,
        gender: 'unspecified',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        profile: {
          bio: 'Hey there! I am using CupidX.',
          age: 18,
          dateOfBirth: null,
          gender: 'unspecified',
          themePreference: 'purple',
          avatarType: 'EMOJI',
          avatarEmoji: '😊',
          avatarUrl: null,
          interests: '',
          randomChatIntroSeen: false,
          ageGenderConfirmed: false,
        },
        subscription: {
          isActive: false,
          plan: 'FREE',
        },
      };

      const isProfileDone = Boolean(
        backendUser?.profileCompleted ||
        backendUser?.profileLocked ||
        backendUser?.genderDobLocked ||
        backendUser?.profile?.ageGenderConfirmed ||
        baseProfile.profileCompleted ||
        baseProfile.profile?.ageGenderConfirmed ||
        ((backendUser?.dob || baseProfile.dateOfBirth || baseProfile.profile?.dateOfBirth) &&
          (backendUser?.gender || baseProfile.gender) !== 'unspecified' &&
          (backendUser?.fullName || baseProfile.fullName))
      );

      const mergedProfile: UserProfile = {
        ...baseProfile,
        id: backendUser?.id || baseProfile.id,
        uid: cUser.id,
        clerkUserId: cUser.id,
        username: backendUser?.username || baseProfile.username,
        usernameLower: (backendUser?.username || baseProfile.username).toLowerCase(),
        vipUsername: backendUser?.vipUsername || (baseProfile as any).vipUsername || null,
        vipUsernameClaimedAt: backendUser?.vipUsernameClaimedAt || (baseProfile as any).vipUsernameClaimedAt || null,
        fullName: backendUser?.fullName || baseProfile.fullName,
        displayName: backendUser?.displayName || baseProfile.displayName,
        email: backendUser?.email || baseProfile.email,
        role: (backendUser?.role as any) || baseProfile.role,
        membershipTier: backendUser?.membershipTier || baseProfile.membershipTier,
        is_vip: Boolean(backendUser?.is_vip ?? baseProfile.is_vip),
        isVIP: Boolean(backendUser?.is_vip ?? baseProfile.isVIP),
        dateOfBirth: backendUser?.dob || baseProfile.dateOfBirth,
        gender: backendUser?.gender || baseProfile.gender,
        genderDobLocked: Boolean(backendUser?.genderDobLocked ?? baseProfile.genderDobLocked),
        profileLocked: Boolean(backendUser?.profileLocked ?? baseProfile.profileLocked ?? isProfileDone),
        profileCompleted: isProfileDone,
        profile: {
          ...baseProfile.profile,
          ...(backendUser?.profile || {}),
          avatarEmoji: backendUser?.profile?.avatarEmoji || baseProfile.profile?.avatarEmoji || '😊',
          avatarType: backendUser?.profile?.avatarType || baseProfile.profile?.avatarType || 'EMOJI',
          avatarUrl: backendUser?.profile?.avatarUrl || baseProfile.profile?.avatarUrl || null,
          ageGenderConfirmed: Boolean(
            backendUser?.profile?.ageGenderConfirmed ||
            baseProfile.profile?.ageGenderConfirmed ||
            backendUser?.genderDobLocked
          ),
          age: backendUser?.dob ? calculateAge(backendUser.dob) : baseProfile.profile?.age,
        },
        subscription: backendUser?.subscription || baseProfile.subscription,
      };

      setUser(mergedProfile);
      return mergedProfile;
    } catch (err) {
      console.error('[AUTH] Profile load error:', err);
      return null;
    }
  };

  const refreshUser = useCallback(async () => {
    if (clerkUser) {
      currentInitUidRef.current = null;
      await initializeUserSession(clerkUser);
    }
  }, [clerkUser]);

  // ─── 1. Handle Clerk User State Changes ─────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && clerkUser) {
      initializeUserSession(clerkUser).then(() => {
        setLoading(false);
      });
    } else {
      setUser(null);
      currentInitUidRef.current = null;
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, clerkUser]);

  // ─── 2. Route Guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || loading) return;

    const publicPaths = [
      '/',
      '/login',
      '/register',
      '/signup',
      '/privacy',
      '/terms',
      '/safety',
      '/community-guidelines',
      '/sso-callback',
      '/forgot-password',
    ];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const isAuthed = Boolean(isSignedIn && clerkUser);

    // Unauthenticated user on protected route
    if (!isAuthed && !isPublic && pathname !== '/onboarding') {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      console.log('[AUTH GUARD] Unauthenticated user -> redirecting to /login');
      router.replace('/login');
      setTimeout(() => { isNavigatingRef.current = false; }, 500);
      return;
    }

    // Authenticated user on auth pages (/login, /signup, /register)
    if (isAuthed && user) {
      const isComplete = checkProfileCompletion(user);

      if (pathname === '/login' || pathname === '/register' || pathname === '/signup') {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        const target = isComplete ? '/dashboard' : '/onboarding';
        console.log('[AUTH GUARD] Authenticated user on auth page -> redirecting to:', target);
        router.replace(target);
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Already completed onboarding on /onboarding
      if (pathname === '/onboarding' && isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        router.replace('/dashboard');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Incomplete profile on protected route
      if (!isPublic && pathname !== '/onboarding' && !isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        router.replace('/onboarding');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }
    }
  }, [isLoaded, loading, isSignedIn, clerkUser, user, pathname, router]);

  // ─── 3. Google 1-Click Sign-in via Clerk ────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    console.log('[AUTH] Clerk Google login initiated');
    const origin = typeof window !== 'undefined' && window.location.origin 
      ? window.location.origin 
      : 'https://www.cupidxchat.in';

    const targetRedirectUrl = `${origin}/sso-callback`;
    const targetDashboardUrl = `${origin}/dashboard`;

    const client = (clerk as any)?.client;

    // 1. Primary: Use client.signIn.authenticateWithRedirect with continueSignUp enabled
    if (client?.signIn?.authenticateWithRedirect) {
      try {
        await client.signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: targetRedirectUrl,
          redirectUrlComplete: targetDashboardUrl,
          continueSignUp: true,
        });
        return;
      } catch (signInErr: any) {
        console.warn('[AUTH] client.signIn.authenticateWithRedirect notice:', signInErr);
      }
    }

    // 2. Secondary: If signIn wasn't ready or threw, try client.signUp.authenticateWithRedirect with continueSignIn
    if (client?.signUp?.authenticateWithRedirect) {
      try {
        await client.signUp.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: targetRedirectUrl,
          redirectUrlComplete: targetDashboardUrl,
          continueSignIn: true,
        });
        return;
      } catch (signUpErr: any) {
        console.warn('[AUTH] client.signUp.authenticateWithRedirect notice:', signUpErr);
      }
    }

    // 3. Fallback: Open Clerk Sign-In modal
    if (clerk?.openSignIn) {
      try {
        clerk.openSignIn({
          fallbackRedirectUrl: '/dashboard',
          signUpFallbackRedirectUrl: '/onboarding',
        });
        return;
      } catch (modalErr) {
        console.warn('[AUTH] openSignIn modal notice:', modalErr);
      }
    }

    // 4. Fallback: clerk.redirectToSignIn
    if (clerk && typeof (clerk as any).redirectToSignIn === 'function') {
      await (clerk as any).redirectToSignIn({
        fallbackRedirectUrl: '/dashboard',
        signUpFallbackRedirectUrl: '/onboarding',
      });
    }
  }, [clerk]);

  const signUpWithGoogle = useCallback(async () => {
    console.log('[AUTH] Clerk Google signup initiated');
    const origin = typeof window !== 'undefined' && window.location.origin 
      ? window.location.origin 
      : 'https://www.cupidxchat.in';

    const targetRedirectUrl = `${origin}/sso-callback`;
    const targetOnboardingUrl = `${origin}/onboarding`;

    const client = (clerk as any)?.client;

    // 1. Primary: Use client.signUp.authenticateWithRedirect with continueSignIn enabled
    if (client?.signUp?.authenticateWithRedirect) {
      try {
        await client.signUp.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: targetRedirectUrl,
          redirectUrlComplete: targetOnboardingUrl,
          continueSignIn: true,
        });
        return;
      } catch (signUpErr: any) {
        console.warn('[AUTH] client.signUp.authenticateWithRedirect notice:', signUpErr);
      }
    }

    // 2. Secondary: Try client.signIn.authenticateWithRedirect with continueSignUp enabled
    if (client?.signIn?.authenticateWithRedirect) {
      try {
        await client.signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: targetRedirectUrl,
          redirectUrlComplete: targetOnboardingUrl,
          continueSignUp: true,
        });
        return;
      } catch (signInErr: any) {
        console.warn('[AUTH] client.signIn.authenticateWithRedirect notice:', signInErr);
      }
    }

    // 3. Fallback: Open Clerk Sign-Up modal
    if (clerk?.openSignUp) {
      try {
        clerk.openSignUp({
          fallbackRedirectUrl: '/onboarding',
        });
        return;
      } catch (modalErr) {
        console.warn('[AUTH] openSignUp modal notice:', modalErr);
      }
    }

    // 4. Fallback: clerk.redirectToSignUp
    if (clerk && typeof (clerk as any).redirectToSignUp === 'function') {
      await (clerk as any).redirectToSignUp({
        fallbackRedirectUrl: '/onboarding',
      });
    }
  }, [clerk]);

  // ─── 4. Email / Password Login via Clerk ────────────────────────────────────
  const loginWithEmail = useCallback(async (emailOrUsername: string, pass: string) => {
    if (!clerk) {
      throw new Error('Sign-in service is initializing. Please try again.');
    }
    const client = (clerk as any).client;
    if (!client?.signIn) {
      clerk.openSignIn({
        fallbackRedirectUrl: '/dashboard',
        signUpFallbackRedirectUrl: '/onboarding',
        initialValues: {
          emailAddress: emailOrUsername.includes('@') ? emailOrUsername : undefined,
        },
      });
      return;
    }

    try {
      const result = await client.signIn.create({
        identifier: emailOrUsername.trim(),
        password: pass,
      });

      if (result.status === 'complete') {
        await clerk.setActive({ 
          session: result.createdSessionId,
          redirectUrl: '/dashboard',
        });
      } else {
        console.warn('[AUTH] Incomplete sign-in status:', result.status);
        clerk.openSignIn({
          fallbackRedirectUrl: '/dashboard',
          signUpFallbackRedirectUrl: '/onboarding',
          initialValues: {
            emailAddress: emailOrUsername.includes('@') ? emailOrUsername : undefined,
          },
        });
      }
    } catch (err: any) {
      console.error('[AUTH] Clerk login error:', err);
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Invalid email or password.';
      throw new Error(msg);
    }
  }, [clerk]);

  // ─── 5. Email / Password Signup via Clerk ───────────────────────────────────
  const signUpWithEmail = useCallback(async (emailOrUsername: string, pass: string, name?: string) => {
    if (!clerk) {
      throw new Error('Sign-up service is initializing. Please try again.');
    }
    const client = (clerk as any).client;
    if (!client?.signUp) {
      clerk.openSignUp({
        fallbackRedirectUrl: '/onboarding',
        initialValues: {
          emailAddress: emailOrUsername.includes('@') ? emailOrUsername : undefined,
          firstName: name || undefined,
        },
      });
      return;
    }

    try {
      const isEmail = emailOrUsername.includes('@');
      const result = await client.signUp.create({
        emailAddress: isEmail ? emailOrUsername.trim() : undefined,
        username: !isEmail ? emailOrUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') : undefined,
        password: pass,
        firstName: name || undefined,
      });

      if (result.status === 'complete') {
        await clerk.setActive({ 
          session: result.createdSessionId,
          redirectUrl: '/onboarding',
        });
      } else {
        console.warn('[AUTH] Sign-up requires additional verification:', result.status);
        clerk.openSignUp({
          fallbackRedirectUrl: '/onboarding',
          initialValues: {
            emailAddress: isEmail ? emailOrUsername.trim() : undefined,
            firstName: name || undefined,
          },
        });
      }
    } catch (err: any) {
      console.error('[AUTH] Clerk signup error:', err);
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || 'Could not complete registration.';
      throw new Error(msg);
    }
  }, [clerk]);

  // ─── 6. Logout via Clerk ───────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      if (clerkUser?.id) {
        setFirestoreUserPresence(clerkUser.id, false).catch(() => {});
      }

      if (typeof document !== 'undefined') {
        document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;';
      }

      setUser(null);
      currentInitUidRef.current = null;

      if (clerk) {
        await clerk.signOut();
      }
      router.replace('/login');
    } catch (e) {
      console.error('[AUTH] Logout error:', e);
      router.replace('/login');
    }
  }, [clerkUser?.id, clerk, router]);

  const isAuthenticated = Boolean(isSignedIn && clerkUser);

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
