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
   * Sync user with both Firestore and backend /api/auth/me
   */
  const handleUserSession = async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      // Check if user has an active token cookie
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser(data.user);
            return data.user;
          }
        }
      } catch {}
      setUser(null);
      return null;
    }

    // 1. Fetch or create user in Firestore (Persistent Cloud Database)
    try {
      const firestoreProfile = await getOrCreateFirestoreUser(fbUser);
      setUser(firestoreProfile);

      // 2. Background sync with backend SQLite / JWT cookie
      try {
        const idToken = await fbUser.getIdToken();
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUser((prev) => ({
              ...firestoreProfile,
              ...data.user,
              profile: {
                ...firestoreProfile.profile,
                ...(data.user.profile || {}),
              },
            }));
          }
        }
      } catch (backendErr) {
        console.warn('Backend sync notice (using Firestore session):', backendErr);
      }

      return firestoreProfile;
    } catch (err) {
      console.error('Error handling user session:', err);
      return null;
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      await handleUserSession(auth.currentUser);
    }
  };

  // ─── Firebase Auth State Listener (Source of Truth) ───────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
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

  // ─── Strict Client Route Guard (No Redirect Loops) ─────────────────────────────
  useEffect(() => {
    // NEVER redirect while Firebase Auth is determining session (AUTH_LOADING)
    if (loading) return;

    const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback'];
    const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

    const hasTokenCookie = typeof document !== 'undefined' && document.cookie.includes('token=');
    const isAuthenticated = Boolean(user || firebaseUser || auth.currentUser || hasTokenCookie);

    // 1. Unauthenticated users trying to access private routes -> send to /login
    if (!isAuthenticated && !isPublic) {
      router.push('/login');
    }

    // 2. Authenticated users on auth pages (/login, /signup, /register) -> send to /dashboard
    if (isAuthenticated && (pathname === '/login' || pathname === '/register' || pathname === '/signup')) {
      router.push('/dashboard');
    }
  }, [loading, user, firebaseUser, pathname, router]);

  // ─── 1. Google 1-Click Sign-in ────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        setFirebaseUser(result.user);
        const profile = await getOrCreateFirestoreUser(result.user);
        setUser(profile);
        // Background backend sync
        handleUserSession(result.user).catch(() => {});
        router.push('/dashboard');
      }
    } catch (err) {
      setLoading(false);
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
          router.push('/dashboard');
          setLoading(false);
          return;
        }
      } catch (fbErr: any) {
        console.warn('Firebase email auth notice, trying backend database:', fbErr?.code || fbErr);
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
          router.push('/dashboard');
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
      console.warn('Firebase signup notice, proceeding with database registration:', fbErr?.code || fbErr);
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
          router.push('/dashboard');
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

    router.push('/dashboard');
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
        router.push('/login');
      }
    } catch (e) {
      console.error('Logout error:', e);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
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
