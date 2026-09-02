'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import {
  getOrCreateFirestoreUser,
  setFirestoreUserPresence,
  calculateAge,
  type UserProfile,
} from '@/lib/firestoreUser';
import { ensureFirebaseAuth } from '@/lib/firestoreMatchmaking';

export type User = UserProfile;

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
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

  // Track initialization to guarantee execution happens ONCE per user
  const currentInitUidRef = useRef<string | null>(null);
  const isNavigatingRef = useRef<boolean>(false);

  /**
   * Helper to check if a user has completed the mandatory onboarding profile
   */
  const checkProfileCompletion = (u: User | null): boolean => {
    console.log('[AUTH-08] Onboarding check started for:', u?.username || 'null');
    if (!u) {
      console.log('[AUTH-09] Onboarding check completed: isComplete = false (no user)');
      return false;
    }
    const isComp = Boolean(
      u.profileCompleted === true ||
      (u.dateOfBirth && u.gender && u.gender !== 'unspecified') ||
      (u.profile?.dateOfBirth && u.profile?.gender && u.profile?.gender !== 'unspecified')
    );
    console.log('[AUTH-09] Onboarding check completed: isComplete =', isComp, 'for UID:', u.uid);
    return isComp;
  };

  /**
   * Initialize user profile once from Firestore.
   * Firestore is the single source of truth — SQLite sync is fire-and-forget and does NOT overwrite profile state.
   */
  const initializeUserSession = async (fbUser: FirebaseUser | null): Promise<UserProfile | null> => {
    if (!fbUser) {
      currentInitUidRef.current = null;
      setUser(null);
      return null;
    }

    // Prevent duplicate concurrent initialization for the same user
    if (currentInitUidRef.current === fbUser.uid && user) {
      return user;
    }
    currentInitUidRef.current = fbUser.uid;

    console.log('[AUTH-04] Profile request started for UID:', fbUser.uid);
    console.log('[AUTH-06] Profile initialization started');
    try {
      const firestoreProfile = await getOrCreateFirestoreUser(fbUser);
      console.log('[AUTH-05] Profile request completed. Username:', firestoreProfile.username);
      console.log('[AUTH-07] Profile initialization completed. profileCompleted:', firestoreProfile.profileCompleted);
      
      setUser(firestoreProfile);

      // Fire-and-forget JWT session cookie sync for API routes (does NOT mutate state)
      fbUser.getIdToken().then((idToken) => {
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${idToken}` },
        }).catch(() => {});
      }).catch(() => {});

      return firestoreProfile;
    } catch (err) {
      console.error('[AUTH-ERROR] Profile initialization error:', err);
      return null;
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      currentInitUidRef.current = null; // Force reload
      await initializeUserSession(auth.currentUser);
    }
  };

  // ─── Firebase Auth State Listener (Single Source of Truth) ───────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.log('[AUTH-03] Auth state changed. UID:', fbUser?.uid || 'null');
      setFirebaseUser(fbUser);
      if (fbUser) {
        console.log('[AUTH-02] Firebase UID received:', fbUser.uid);
        await initializeUserSession(fbUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ─── Single Authoritative Route Guard ─────────────────────────────────────────
  useEffect(() => {
    // WHILE AUTH_LOADING: NEVER REDIRECT
    if (loading) return;

    const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback'];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const isAuthenticated = Boolean(user || firebaseUser || auth.currentUser);

    // 1. Unauthenticated users trying to access protected routes -> send to /login
    if (!isAuthenticated && !isPublic && pathname !== '/onboarding') {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      console.log('[AUTH-REDIRECT] Unauthenticated user accessing private route:', pathname, '-> redirecting to /login');
      router.replace('/login');
      setTimeout(() => { isNavigatingRef.current = false; }, 500);
      return;
    }

    // 2. Authenticated users
    if (isAuthenticated && user) {
      const isComplete = checkProfileCompletion(user);

      // A. Authenticated on login / signup / register
      if (pathname === '/login' || pathname === '/register' || pathname === '/signup') {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        const target = isComplete ? '/dashboard' : '/onboarding';
        console.log('[AUTH-10] Dashboard redirect started -> Target:', target);
        router.replace(target);
        console.log('[AUTH-11] Dashboard redirect completed');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // B. Completed user on /onboarding -> send to /dashboard
      if (pathname === '/onboarding' && isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        console.log('[AUTH-10] Dashboard redirect started (user already completed onboarding)');
        router.replace('/dashboard');
        console.log('[AUTH-11] Dashboard redirect completed');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }

      // C. Incomplete user trying to access /dashboard or /chat/* -> send to /onboarding
      if (!isPublic && pathname !== '/onboarding' && !isComplete) {
        if (isNavigatingRef.current) return;
        isNavigatingRef.current = true;
        console.log('[AUTH-REDIRECT] Incomplete profile on protected route -> redirecting to /onboarding');
        router.replace('/onboarding');
        setTimeout(() => { isNavigatingRef.current = false; }, 500);
        return;
      }
    }
  }, [loading, user, firebaseUser, pathname, router]);

  // ─── 1. Google 1-Click Sign-in ────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    setLoading(true);
    console.log('[AUTH-01] Google authentication started');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('[AUTH-01] Google authentication successful');
      console.log('[AUTH-02] Firebase UID received:', result.user?.uid);

      if (result.user) {
        setFirebaseUser(result.user);
        const profile = await initializeUserSession(result.user);
        setLoading(false);

        if (profile) {
          const isComplete = checkProfileCompletion(profile);
          const target = isComplete ? '/dashboard' : '/onboarding';
          console.log('[AUTH-10] Dashboard redirect started -> Target:', target);
          router.replace(target);
          console.log('[AUTH-11] Dashboard redirect completed');
        }
      }
    } catch (err: any) {
      setLoading(false);
      console.error('[AUTH-ERROR] Google sign-in failed:', err?.code, err?.message);
      throw err;
    }
  };

  // ─── 2. Email / Username Sign-in ──────────────────────────────────────────────
  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
    setLoading(true);
    const identifier = emailOrUsername.trim();

    if (identifier.includes('@')) {
      try {
        const result = await signInWithEmailAndPassword(auth, identifier, pass);
        if (result.user) {
          setFirebaseUser(result.user);
          const profile = await initializeUserSession(result.user);
          setLoading(false);

          if (profile) {
            const isComplete = checkProfileCompletion(profile);
            const target = isComplete ? '/dashboard' : '/onboarding';
            router.replace(target);
          }
          return;
        }
      } catch (fbErr: any) {
        console.warn('[AUTH] Firebase email auth notice, trying backend database:', fbErr?.code || fbErr);
      }
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: identifier.includes('@') ? identifier.split('@')[0] : identifier,
          password: pass,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          ensureFirebaseAuth().catch(() => {});
          const isComplete = checkProfileCompletion(data.user);
          const target = isComplete ? '/dashboard' : '/onboarding';
          router.replace(target);
          setLoading(false);
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Invalid credentials');
      }
    } catch (dbErr: any) {
      setLoading(false);
      throw new Error(dbErr?.message || 'Invalid credentials. Please check your username and password.');
    }
  };

  // ─── 3. Email / Username Sign-up ──────────────────────────────────────────────
  const signUpWithEmail = async (emailOrUsername: string, pass: string, name?: string) => {
    setLoading(true);
    const identifier = emailOrUsername.trim();
    const cleanUsername = (identifier.includes('@') ? identifier.split('@')[0] : identifier).toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${Date.now().toString().slice(-4)}`;
    const effectiveEmail = identifier.includes('@') ? identifier : `${cleanUsername}@cupidxchat.in`;

    let fbSuccess = false;

    try {
      const result = await createUserWithEmailAndPassword(auth, effectiveEmail, pass);
      if (result.user) {
        setFirebaseUser(result.user);
        await initializeUserSession(result.user);
        fbSuccess = true;
      }
    } catch (fbErr: any) {
      console.warn('[AUTH] Firebase signup notice, proceeding with database registration:', fbErr?.code || fbErr);
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name || cleanUsername,
          username: cleanUsername,
          password: pass,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          ensureFirebaseAuth().catch(() => {});
          router.replace('/onboarding');
          setLoading(false);
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (!fbSuccess) {
          throw new Error(errData.error || 'Registration failed');
        }
      }
    } catch (dbErr: any) {
      if (!fbSuccess) {
        setLoading(false);
        throw dbErr;
      }
    }

    router.replace('/onboarding');
    setLoading(false);
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
      console.error('[AUTH-ERROR] Logout error:', e);
      router.replace('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
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
