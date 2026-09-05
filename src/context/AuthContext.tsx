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
  firebaseUser: any | null; // Compatibility alias
  loading: boolean;
  isAuthenticated: boolean;
  loginWithGoogle: () => Promise<void>;
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
   * Safe, atomic browser navigation
   */
  const hardNavigate = (target: string) => {
    if (typeof window !== 'undefined') {
      window.location.replace(target);
    } else {
      router.replace(target);
    }
  };

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

    const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback', '/forgot-password'];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const isAuthed = Boolean(isSignedIn && clerkUser);

    // Unauthenticated user on protected route
    if (!isAuthed && !isPublic && pathname !== '/onboarding') {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      console.log('[AUTH GUARD] Unauthenticated user -> redirecting to /login');
      hardNavigate('/login');
      setTimeout(() => { isNavigatingRef.current = false; }, 500);
      return;
    }

    // Authenticated user on auth pages (/login, /signup)
    if (isAuthed && user) {
      const isComplete = checkProfileCompletion(user);

      if (pathname === '/login' || pathname === '/register' || pathname === '/signup') {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        const target = isComplete ? '/dashboard' : '/onboarding';
        console.log('[AUTH GUARD] Authenticated user on auth page -> redirecting to:', target);
        hardNavigate(target);
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Already completed onboarding on /onboarding
      if (pathname === '/onboarding' && isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        hardNavigate('/dashboard');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Incomplete profile on protected route
      if (!isPublic && pathname !== '/onboarding' && !isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        hardNavigate('/onboarding');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }
    }
  }, [isLoaded, loading, isSignedIn, clerkUser, user, pathname]);

  // ─── 3. Google 1-Click Sign-in via Clerk ────────────────────────────────────
  const loginWithGoogle = async () => {
    if (!clerk) return;
    console.log('[AUTH] Clerk Google login initiated');
    try {
      clerk.openSignIn({
        fallbackRedirectUrl: '/dashboard',
        signUpFallbackRedirectUrl: '/onboarding',
      });
    } catch (err: any) {
      console.error('[AUTH] Clerk Google login error:', err);
      throw new Error(err?.message || 'Unable to open Google sign in. Please try again.');
    }
  };

  // ─── 4. Email / Password Login via Clerk ────────────────────────────────────
  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
    if (!clerk) throw new Error('Authentication is loading, please try again.');
    try {
      clerk.openSignIn({
        fallbackRedirectUrl: '/dashboard',
        signUpFallbackRedirectUrl: '/onboarding',
        initialValues: {
          emailAddress: emailOrUsername.includes('@') ? emailOrUsername : undefined,
        },
      });
    } catch (err: any) {
      console.error('[AUTH] Clerk login error:', err);
      throw new Error(err?.message || 'Invalid email or password.');
    }
  };

  // ─── 5. Email / Password Signup via Clerk ───────────────────────────────────
  const signUpWithEmail = async (emailOrUsername: string, pass: string, name?: string) => {
    if (!clerk) throw new Error('Authentication is loading, please try again.');
    try {
      clerk.openSignUp({
        fallbackRedirectUrl: '/onboarding',
        initialValues: {
          emailAddress: emailOrUsername.includes('@') ? emailOrUsername : undefined,
          firstName: name || undefined,
        },
      });
    } catch (err: any) {
      console.error('[AUTH] Clerk signup error:', err);
      throw new Error(err?.message || 'Could not complete registration.');
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

      if (clerk) {
        await clerk.signOut(() => {
          hardNavigate('/login');
        });
      } else {
        hardNavigate('/login');
      }
    } catch (e) {
      console.error('[AUTH] Logout error:', e);
      hardNavigate('/login');
    }
  };

  const isAuthenticated = Boolean(isSignedIn && clerkUser);

  return (
    <AuthContext.Provider
      value={{
        user,
        clerkUser,
        firebaseUser: clerkUser ? { uid: clerkUser.id, displayName: clerkUser.fullName || clerkUser.username, email: clerkUser.primaryEmailAddress?.emailAddress, photoURL: clerkUser.imageUrl } : null,
        loading: !isLoaded || loading,
        isAuthenticated,
        loginWithGoogle,
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
