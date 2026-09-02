'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
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

  /**
   * Helper to check if a user has completed the mandatory onboarding profile
   */
  const checkProfileCompletion = (u: User | null): boolean => {
    if (!u) return false;
    return Boolean(
      u.profileCompleted ||
      (u.profile?.ageGenderConfirmed && u.gender && u.gender !== 'unspecified' && (u.dateOfBirth || u.profile?.dateOfBirth))
    );
  };

  /**
   * Sync user with both Firestore and backend /api/auth/me
   */
  const handleUserSession = async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      setUser(null);
      return null;
    }

    try {
      const firestoreProfile = await getOrCreateFirestoreUser(fbUser);
      setUser(firestoreProfile);

      // Background sync with backend SQLite / JWT cookie (non-blocking)
      fbUser.getIdToken().then((idToken) => {
        fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.user) {
              const dynamicAge = calculateAge(
                data.user.dob || data.user.profile?.dob || firestoreProfile.dateOfBirth
              );
              setUser((prev) => {
                if (!prev) return firestoreProfile;
                return {
                  ...firestoreProfile,
                  ...data.user,
                  profileCompleted: Boolean(
                    firestoreProfile.profileCompleted ||
                    (data.user.profile?.ageGenderConfirmed && data.user.gender !== 'unspecified')
                  ),
                  dateOfBirth: firestoreProfile.dateOfBirth || data.user.dob || null,
                  gender: firestoreProfile.gender || data.user.gender || 'unspecified',
                  profile: {
                    ...firestoreProfile.profile,
                    ...(data.user.profile || {}),
                    age: dynamicAge,
                    dateOfBirth: firestoreProfile.dateOfBirth || data.user.dob || null,
                  },
                };
              });
            }
          })
          .catch(() => {});
      }).catch(() => {});

      return firestoreProfile;
    } catch (err) {
      console.error('[AUTH] Error loading user session:', err);
      return null;
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      await handleUserSession(auth.currentUser);
    }
  };

  // ─── Firebase Auth State Listener (Single Source of Truth) ───────────────────
  useEffect(() => {
    console.log('[AUTH] Initializing onAuthStateChanged listener');
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.log('[AUTH] onAuthStateChanged received user:', fbUser?.uid || 'null');
      setFirebaseUser(fbUser);
      if (fbUser) {
        await handleUserSession(fbUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ─── Strict Route Guard (Sole Authoritative Route Transition Guard) ───────────
  useEffect(() => {
    // NEVER redirect while Firebase Auth is determining session (AUTH_LOADING)
    if (loading) return;

    const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback'];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const hasTokenCookie = typeof document !== 'undefined' && document.cookie.includes('token=');
    const isAuthenticated = Boolean(user || firebaseUser || auth.currentUser || hasTokenCookie);

    // 1. Unauthenticated users trying to access protected routes -> send to /login
    if (!isAuthenticated && !isPublic && pathname !== '/onboarding') {
      console.log('[AUTH] Unauthenticated access to private route, redirecting to /login');
      router.replace('/login');
      return;
    }

    // 2. Authenticated users: Check if first-time profile onboarding is required
    if (isAuthenticated && user) {
      const isComplete = checkProfileCompletion(user);

      // Incomplete profile on private route or auth page -> send to /onboarding
      if (!isComplete && pathname !== '/onboarding') {
        console.log('[AUTH] Profile incomplete, directing to /onboarding');
        router.replace('/onboarding');
        return;
      }

      // Complete profile on auth pages or onboarding -> send to /dashboard
      if (isComplete && (pathname === '/login' || pathname === '/register' || pathname === '/signup' || pathname === '/onboarding')) {
        console.log('[AUTH] Profile complete on auth/onboarding page, directing to /dashboard');
        router.replace('/dashboard');
        return;
      }
    }
  }, [loading, user, firebaseUser, pathname, router]);

  // ─── 1. Google 1-Click Sign-in ────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    setLoading(true);
    console.log('[AUTH] Google sign-in started');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        console.log('[AUTH] Google sign-in successful. UID:', result.user.uid);
        setFirebaseUser(result.user);
        const profile = await getOrCreateFirestoreUser(result.user);
        setUser(profile);
        handleUserSession(result.user).catch(() => {});

        const isComplete = checkProfileCompletion(profile);
        const target = isComplete ? '/dashboard' : '/onboarding';
        console.log('[AUTH] Navigating to:', target);
        router.replace(target);
      }
    } catch (err) {
      setLoading(false);
      console.error('[AUTH] Google sign-in error:', err);
      throw err;
    }
    setLoading(false);
  };

  // ─── 2. Email / Username Sign-in ──────────────────────────────────────────────
  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
    setLoading(true);
    const identifier = emailOrUsername.trim();

    // A. If identifier is an email, try Firebase Auth first
    if (identifier.includes('@')) {
      try {
        const result = await signInWithEmailAndPassword(auth, identifier, pass);
        if (result.user) {
          setFirebaseUser(result.user);
          const profile = await getOrCreateFirestoreUser(result.user);
          setUser(profile);
          handleUserSession(result.user).catch(() => {});

          const isComplete = checkProfileCompletion(profile);
          router.replace(isComplete ? '/dashboard' : '/onboarding');
          setLoading(false);
          return;
        }
      } catch (fbErr: any) {
        console.warn('[AUTH] Firebase email auth notice, trying backend database:', fbErr?.code || fbErr);
      }
    }

    // B. Try database login (/api/auth/login)
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
          router.replace(isComplete ? '/dashboard' : '/onboarding');
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
    setLoading(false);
  };

  // ─── 3. Email / Username Sign-up ──────────────────────────────────────────────
  const signUpWithEmail = async (emailOrUsername: string, pass: string, name?: string) => {
    setLoading(true);
    const identifier = emailOrUsername.trim();
    const cleanUsername = (identifier.includes('@') ? identifier.split('@')[0] : identifier).toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${Date.now().toString().slice(-4)}`;
    const effectiveEmail = identifier.includes('@') ? identifier : `${cleanUsername}@cupidxchat.in`;

    let fbSuccess = false;

    // A. Try Firebase Auth
    try {
      const result = await createUserWithEmailAndPassword(auth, effectiveEmail, pass);
      if (result.user) {
        setFirebaseUser(result.user);
        const profile = await getOrCreateFirestoreUser(result.user);
        setUser(profile);
        handleUserSession(result.user).catch(() => {});
        fbSuccess = true;
      }
    } catch (fbErr: any) {
      console.warn('[AUTH] Firebase signup notice, proceeding with database registration:', fbErr?.code || fbErr);
    }

    // B. Call database registration
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

      setUser(null);
      setFirebaseUser(null);

      router.replace('/login');
    } catch (e) {
      console.error('[AUTH] Logout error:', e);
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
