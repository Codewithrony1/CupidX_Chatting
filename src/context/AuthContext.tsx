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

interface User {
  id: string;
  firebaseUid?: string | null;
  clerkUserId?: string | null;
  username: string;
  fullName: string;
  displayName?: string;
  email?: string | null;
  role: 'USER' | 'ADMIN';
  membershipTier?: string;
  is_vip?: boolean;
  profile?: {
    bio: string;
    showBio?: boolean;
    age: number;
    gender: string;
    ageGenderConfirmed?: boolean;
    ageGenderChangesCount?: number;
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
    nameChangesCount?: number;
  };
  subscription?: {
    isActive: boolean;
    plan: string;
    endDate?: string;
  };
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const syncUserWithBackend = async (fbUser: FirebaseUser | null) => {
    try {
      let headers: Record<string, string> = {};
      if (fbUser) {
        const idToken = await fbUser.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/auth/me', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          return data.user;
        }
      }
      setUser(null);
      return null;
    } catch (e) {
      console.error('Error syncing user with backend:', e);
      setUser(null);
      return null;
    }
  };

  const refreshUser = async () => {
    await syncUserWithBackend(auth.currentUser);
  };

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      await syncUserWithBackend(fbUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Client-side Strict Route Protection Guard
  useEffect(() => {
    if (!loading) {
      const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback'];
      const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

      const hasTokenCookie = typeof document !== 'undefined' && document.cookie.includes('token=');

      if (!user && !firebaseUser && !hasTokenCookie && !isPublic) {
        router.push('/login');
      }

      // Auto redirect authenticated users away from auth pages (/login, /register, /signup) to /dashboard
      if ((user || firebaseUser) && (pathname === '/login' || pathname === '/register' || pathname === '/signup')) {
        router.push('/dashboard');
      }
    }
  }, [loading, user, firebaseUser, pathname, router]);

  // 1. Google 1-Click Sign-in
  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        const syncedUser = await syncUserWithBackend(result.user);
        // Redirect to dashboard regardless — onAuthStateChanged will re-sync
        // If backend returned user go to dashboard, else onboarding
        if (syncedUser) {
          router.push('/dashboard');
        } else {
          // Firebase auth succeeded but backend sync failed (e.g. env var missing)
          // Still push to dashboard — onAuthStateChanged will retry sync
          router.push('/dashboard');
        }
      }
    } catch (err) {
      setLoading(false);
      throw err; // Re-throw so login page can show the error
    }
    setLoading(false);
  };

  // 2. Email / Password Sign-in
  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, pass);
      if (result.user) {
        await syncUserWithBackend(result.user);
        router.push('/dashboard');
      }
    } catch (err) {
      setLoading(false);
      throw err; // Re-throw so login page can show the error
    }
    setLoading(false);
  };

  // 3. Email / Password Sign-up
  const signUpWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      if (result.user) {
        await syncUserWithBackend(result.user);
        router.push('/dashboard');
      }
    } catch (err) {
      setLoading(false);
      throw err; // Re-throw so login page can show the error
    }
    setLoading(false);
  };

  // 4. Logout
  const logout = async () => {
    try {
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
