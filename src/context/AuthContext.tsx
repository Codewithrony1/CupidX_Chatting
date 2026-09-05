'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
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
      (u.dateOfBirth && u.gender && u.gender !== 'unspecified') ||
      (u.profile?.dateOfBirth && u.profile?.gender && u.profile?.gender !== 'unspecified')
    );
  };

  /**
   * Initializes user profile once from Firestore & links with Clerk
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

      const firestoreProfile = await getOrCreateFirestoreUser({
        uid: cUser.id,
        displayName,
        email,
        photoURL,
      });

      setUser(firestoreProfile);

      // Background session sync with API routes
      fetch('/api/auth/me', {
        headers: { 'x-clerk-user-id': cUser.id },
      }).catch(() => {});

      return firestoreProfile;
    } catch (err) {
      console.error('[AUTH] Profile load error:', err);
      return null;
    }
  };

  const refreshUser = async () => {
    if (clerkUser) {
      currentInitUidRef.current = null;
      await initializeUserSession(clerkUser);
    }
  };

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
  const loginWithGoogle = async () => {
    if (!clerk) return;
    console.log('[AUTH] Clerk Google login initiated');
    try {
      const client = (clerk as any).client;
      if (client?.signIn) {
        await client.signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/dashboard',
        });
        return;
      }
      clerk.openSignIn({
        fallbackRedirectUrl: '/dashboard',
        signUpFallbackRedirectUrl: '/onboarding',
      });
    } catch (err: any) {
      console.warn('[AUTH] Direct Google OAuth redirect notice:', err);
      clerk.openSignIn({
        fallbackRedirectUrl: '/dashboard',
        signUpFallbackRedirectUrl: '/onboarding',
      });
    }
  };

  const signUpWithGoogle = async () => {
    if (!clerk) return;
    console.log('[AUTH] Clerk Google signup initiated');
    try {
      const client = (clerk as any).client;
      if (client?.signUp) {
        await client.signUp.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/onboarding',
        });
        return;
      }
      clerk.openSignUp({
        fallbackRedirectUrl: '/onboarding',
      });
    } catch (err: any) {
      console.warn('[AUTH] Direct Google OAuth signup notice:', err);
      clerk.openSignUp({
        fallbackRedirectUrl: '/onboarding',
      });
    }
  };

  // ─── 4. Email / Password Login via Clerk ────────────────────────────────────
  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
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
        await clerk.setActive({ session: result.createdSessionId });
        router.replace('/dashboard');
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
  };

  // ─── 5. Email / Password Signup via Clerk ───────────────────────────────────
  const signUpWithEmail = async (emailOrUsername: string, pass: string, name?: string) => {
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
        await clerk.setActive({ session: result.createdSessionId });
        router.replace('/onboarding');
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
  };

  // ─── 6. Logout via Clerk ───────────────────────────────────────────────────
  const logout = async () => {
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
  };

  const isAuthenticated = Boolean(isSignedIn && clerkUser);

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
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
