'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateFirebaseProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import {
  getOrCreateFirestoreUser,
  updateFirestoreUserProfile,
  setFirestoreUserPresence,
  calculateAge,
  type UserProfile,
} from '@/lib/firestoreUser';
import { getFriendlyAuthErrorMessage } from '@/lib/authErrors';
import { ensureFirebaseAuth } from '@/lib/firestoreMatchmaking';

export type User = UserProfile;

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
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
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
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
   * Initializes user profile once from Firestore
   */
  const initializeUserSession = async (fbUser: FirebaseUser | null): Promise<UserProfile | null> => {
    if (!fbUser) {
      currentInitUidRef.current = null;
      setUser(null);
      return null;
    }

    if (currentInitUidRef.current === fbUser.uid && user) {
      return user;
    }
    currentInitUidRef.current = fbUser.uid;

    console.log('[AUTH] Profile initialization for UID:', fbUser.uid);
    try {
      const firestoreProfile = await getOrCreateFirestoreUser(fbUser);
      setUser(firestoreProfile);

      // Background session cookie sync for API routes
      fbUser.getIdToken().then((idToken) => {
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${idToken}` },
        }).catch(() => {});
      }).catch(() => {});

      return firestoreProfile;
    } catch (err) {
      console.error('[AUTH] Profile load error:', err);
      return null;
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      currentInitUidRef.current = null;
      await initializeUserSession(auth.currentUser);
    }
  };

  // ─── Single Authoritative Auth State Listener ────────────────────────────────
  useEffect(() => {
    // 1. Check for redirect result (mobile auth fallback)
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          console.log('[AUTH] Google redirect sign-in success. UID:', result.user.uid);
          setFirebaseUser(result.user);
          await initializeUserSession(result.user);
        }
      })
      .catch((err) => {
        console.warn('[AUTH] getRedirectResult notice:', err);
      });

    // 2. Continuous auth state observer
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.log('[AUTH] Auth state changed, UID:', fbUser?.uid || 'null');
      setFirebaseUser(fbUser);
      if (fbUser) {
        await initializeUserSession(fbUser);
      } else {
        setUser(null);
        currentInitUidRef.current = null;
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ─── Single Centralized Route Guard ──────────────────────────────────────────
  useEffect(() => {
    // WHILE AUTH_LOADING: NEVER REDIRECT
    if (loading) return;

    const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback', '/forgot-password'];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const isAuthed = Boolean(user || firebaseUser || auth.currentUser);

    // 1. Unauthenticated users on private routes -> redirect to /login
    if (!isAuthed && !isPublic && pathname !== '/onboarding') {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      console.log('[AUTH GUARD] Unauthenticated user accessing private route:', pathname, '-> redirecting to /login');
      router.replace('/login');
      setTimeout(() => { isNavigatingRef.current = false; }, 500);
      return;
    }

    // 2. Authenticated users
    if (isAuthed && user) {
      const isComplete = checkProfileCompletion(user);

      // Authenticated users on auth pages (/login, /signup, /register)
      if (pathname === '/login' || pathname === '/register' || pathname === '/signup') {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        const target = isComplete ? '/dashboard' : '/onboarding';
        console.log('[AUTH GUARD] Authenticated user on auth page -> redirecting to:', target);
        router.replace(target);
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Users who already completed onboarding on /onboarding -> send to /dashboard
      if (pathname === '/onboarding' && isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        console.log('[AUTH GUARD] Profile already complete -> redirecting to /dashboard');
        router.replace('/dashboard');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // Users with incomplete profiles on protected routes -> send to /onboarding
      if (!isPublic && pathname !== '/onboarding' && !isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        console.log('[AUTH GUARD] Incomplete profile on protected route -> redirecting to /onboarding');
        router.replace('/onboarding');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }
    }
  }, [loading, user, firebaseUser, pathname, router]);

  // ─── 1. Google 1-Click Sign-in ────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    console.log('[AUTH] Google login initiated');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        console.log('[AUTH] Google login success. UID:', result.user.uid);
        setFirebaseUser(result.user);
        const profile = await initializeUserSession(result.user);
        if (profile) {
          const isComplete = checkProfileCompletion(profile);
          const target = isComplete ? '/dashboard' : '/onboarding';
          router.replace(target);
        }
      }
    } catch (err: any) {
      console.error('[AUTH] Google login error:', err);
      // If popup is blocked by strict mobile browser, fall back to redirect
      if (err?.code === 'auth/popup-blocked') {
        console.log('[AUTH] Popup was blocked by browser. Using redirect fallback...');
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      const friendlyMsg = getFriendlyAuthErrorMessage(err);
      throw new Error(friendlyMsg);
    }
  };

  // ─── 2. Email / Password Login ────────────────────────────────────────────────
  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
    const identifier = emailOrUsername.trim();
    const effectiveEmail = identifier.includes('@')
      ? identifier
      : `${identifier.toLowerCase().replace(/[^a-z0-9_]/g, '')}@cupidxchat.in`;

    try {
      const result = await signInWithEmailAndPassword(auth, effectiveEmail, pass);
      if (result.user) {
        console.log('[AUTH] Email login success. UID:', result.user.uid);
        setFirebaseUser(result.user);
        const profile = await initializeUserSession(result.user);
        if (profile) {
          const isComplete = checkProfileCompletion(profile);
          const target = isComplete ? '/dashboard' : '/onboarding';
          router.replace(target);
        }
      }
    } catch (err: any) {
      console.error('[AUTH] Email login error:', err);
      const friendlyMsg = getFriendlyAuthErrorMessage(err);
      throw new Error(friendlyMsg);
    }
  };

  // ─── 3. Email / Password Signup ───────────────────────────────────────────────
  const signUpWithEmail = async (emailOrUsername: string, pass: string, name?: string) => {
    const identifier = emailOrUsername.trim();
    const cleanUsername = (identifier.includes('@') ? identifier.split('@')[0] : identifier)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') || `user_${Date.now().toString().slice(-4)}`;
    const effectiveEmail = identifier.includes('@') ? identifier : `${cleanUsername}@cupidxchat.in`;

    try {
      const result = await createUserWithEmailAndPassword(auth, effectiveEmail, pass);
      if (result.user) {
        console.log('[AUTH] Account created successfully. UID:', result.user.uid);
        if (name && name.trim()) {
          await updateFirebaseProfile(result.user, { displayName: name.trim() }).catch(() => {});
        }
        setFirebaseUser(result.user);
        const profile = await initializeUserSession(result.user);
        if (profile && name && name.trim()) {
          await updateFirestoreUserProfile(result.user.uid, {
            fullName: name.trim(),
            displayName: name.trim(),
          }).catch(() => {});
        }
        router.replace('/onboarding');
      }
    } catch (err: any) {
      console.error('[AUTH] Signup error:', err);
      const friendlyMsg = getFriendlyAuthErrorMessage(err);
      throw new Error(friendlyMsg);
    }
  };

  // ─── 4. Logout ────────────────────────────────────────────────────────────────
  const logout = async () => {
    try {
      if (firebaseUser?.uid) {
        setFirestoreUserPresence(firebaseUser.uid, false).catch(() => {});
      }

      if (typeof document !== 'undefined') {
        document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;';
      }

      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      await firebaseSignOut(auth).catch(() => {});

      currentInitUidRef.current = null;
      setUser(null);
      setFirebaseUser(null);

      router.replace('/login');
    } catch (e) {
      console.error('[AUTH] Logout error:', e);
      router.replace('/login');
    }
  };

  const isAuthenticated = Boolean(user || firebaseUser);

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
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
