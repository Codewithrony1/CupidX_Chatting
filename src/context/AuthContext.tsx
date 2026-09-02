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
    const isComp = Boolean(
      u.profileCompleted === true ||
      (u.dateOfBirth && u.gender && u.gender !== 'unspecified') ||
      (u.profile?.dateOfBirth && u.profile?.gender && u.profile?.gender !== 'unspecified')
    );
    console.log('[AUTH] PROFILE COMPLETED =', isComp, 'for user:', u.username);
    return isComp;
  };

  /**
   * Sync user with both Firestore and backend /api/auth/me
   */
  const handleUserSession = async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      setUser(null);
      return null;
    }

    console.log('[AUTH] LOADING USER PROFILE for UID:', fbUser.uid);
    try {
      const firestoreProfile = await getOrCreateFirestoreUser(fbUser);
      console.log('[AUTH] PROFILE RESULT =', firestoreProfile.username, 'profileCompleted =', firestoreProfile.profileCompleted);
      setUser(firestoreProfile);

      // Background non-blocking sync with backend
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
      console.log('[AUTH] AUTH STATE CHANGED, uid =', fbUser?.uid || 'null');
      console.log('[AUTH] auth.currentUser =', auth.currentUser?.uid || 'null');
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

  // ─── Strict Route Guard (Single Authoritative State-Machine Guard) ─────────────
  useEffect(() => {
    console.log('[ROUTER] CURRENT PATH =', pathname, 'loading =', loading, 'user =', user?.username || 'null');
    
    // WHILE AUTH_LOADING: NEVER REDIRECT
    if (loading) return;

    const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback'];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const hasTokenCookie = typeof document !== 'undefined' && document.cookie.includes('token=');
    const isAuthenticated = Boolean(user || firebaseUser || auth.currentUser || hasTokenCookie);

    // 1. Unauthenticated users trying to access protected routes -> redirect to /login
    if (!isAuthenticated && !isPublic && pathname !== '/onboarding') {
      console.log('[AUTH] Unauthenticated on private route, redirecting to /login');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
      return;
    }

    // 2. Authenticated users on auth pages (/login, /signup, /register)
    if (isAuthenticated) {
      const isComplete = checkProfileCompletion(user);

      if (pathname === '/login' || pathname === '/register' || pathname === '/signup') {
        const target = isComplete ? '/dashboard' : '/onboarding';
        console.log('[AUTH] REDIRECTING TO', target);
        console.log('[ROUTER] PUSH', target);
        if (typeof window !== 'undefined') {
          window.location.href = target;
        } else {
          router.replace(target);
        }
        return;
      }

      // If user is on /onboarding but profile is already complete -> redirect to /dashboard
      if (pathname === '/onboarding' && isComplete) {
        console.log('[AUTH] REDIRECTING TO DASHBOARD (profile already complete)');
        console.log('[ROUTER] PUSH /dashboard');
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard';
        } else {
          router.replace('/dashboard');
        }
        return;
      }

      // If user is on private route (/dashboard, /chat/*) but profile is incomplete -> redirect to /onboarding
      if (!isPublic && pathname !== '/onboarding' && !isComplete && user) {
        console.log('[AUTH] REDIRECTING TO /onboarding (profile incomplete)');
        console.log('[ROUTER] PUSH /onboarding');
        if (typeof window !== 'undefined') {
          window.location.href = '/onboarding';
        } else {
          router.replace('/onboarding');
        }
        return;
      }
    }
  }, [loading, user, firebaseUser, pathname, router]);

  // ─── 1. Google 1-Click Sign-in ────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    setLoading(true);
    console.log('[AUTH] SIGN IN STARTED');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      console.log('[AUTH] GOOGLE SIGN IN SUCCESS, uid =', result.user?.uid);
      console.log('[AUTH] auth.currentUser =', auth.currentUser?.uid);

      if (result.user) {
        setFirebaseUser(result.user);
        console.log('[AUTH] LOADING USER PROFILE');
        const profile = await getOrCreateFirestoreUser(result.user);
        console.log('[AUTH] PROFILE RESULT =', profile.username, 'profileCompleted =', profile.profileCompleted);
        setUser(profile);
        handleUserSession(result.user).catch(() => {});

        const isComplete = checkProfileCompletion(profile);
        const target = isComplete ? '/dashboard' : '/onboarding';
        console.log('[AUTH] REDIRECTING TO', target);
        console.log('[ROUTER] PUSH', target);

        if (typeof window !== 'undefined') {
          window.location.href = target;
        } else {
          router.replace(target);
        }
      }
    } catch (err: any) {
      setLoading(false);
      console.error('[AUTH] GOOGLE SIGN IN ERROR:', err?.code, err?.message);
      throw err;
    }
    setLoading(false);
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
          const profile = await getOrCreateFirestoreUser(result.user);
          setUser(profile);
          handleUserSession(result.user).catch(() => {});

          const isComplete = checkProfileCompletion(profile);
          const target = isComplete ? '/dashboard' : '/onboarding';
          if (typeof window !== 'undefined') {
            window.location.href = target;
          } else {
            router.replace(target);
          }
          setLoading(false);
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
          if (typeof window !== 'undefined') {
            window.location.href = target;
          } else {
            router.replace(target);
          }
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
          if (typeof window !== 'undefined') {
            window.location.href = '/onboarding';
          } else {
            router.replace('/onboarding');
          }
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

    if (typeof window !== 'undefined') {
      window.location.href = '/onboarding';
    } else {
      router.replace('/onboarding');
    }
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

      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
    } catch (e) {
      console.error('[AUTH] Logout error:', e);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/login');
      }
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
