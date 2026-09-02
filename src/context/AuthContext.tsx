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
import { ensureFirebaseAuth } from '@/lib/firestoreMatchmaking';

interface User {
  id: string;
  firebaseUid?: string | null;
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
  loginWithEmail: (emailOrUsername: string, pass: string) => Promise<void>;
  signUpWithEmail: (emailOrUsername: string, pass: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function buildFallbackUser(fbUser: FirebaseUser): User {
  const cleanName = fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : '') || `user_${fbUser.uid.slice(-5)}`;
  const cleanUsername = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${fbUser.uid.slice(-5)}`;

  return {
    id: fbUser.uid,
    firebaseUid: fbUser.uid,
    username: cleanUsername,
    fullName: fbUser.displayName || cleanName || 'CupidX User',
    displayName: fbUser.displayName || cleanName || 'CupidX User',
    email: fbUser.email,
    role: 'USER',
    membershipTier: 'FREE',
    is_vip: false,
    profile: {
      bio: 'Hey there! I am using CupidX.',
      age: 21,
      gender: 'unspecified',
      preferredGender: 'auto',
      mood: '😊 Happy',
      avatarUrl: fbUser.photoURL || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${cleanUsername}`,
      avatarEmoji: '😊',
      themePreference: 'purple',
      interests: '',
      randomChatIntroSeen: true,
      ageGenderConfirmed: true,
    },
    subscription: {
      isActive: false,
      plan: 'FREE',
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const syncUserWithBackend = async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      // Check if logged in via cookie
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

    // Set base user immediately on client
    const fallback = buildFallbackUser(fbUser);
    setUser((prev) => prev || fallback);

    try {
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          return data.user;
        }
      }
    } catch (e) {
      console.warn('Backend sync notice (using client user session):', e);
    }

    return fallback;
  };

  const refreshUser = async () => {
    await syncUserWithBackend(auth.currentUser);
  };

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        setUser(buildFallbackUser(fbUser));
      }
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
      const isAuthenticated = Boolean(user || firebaseUser || auth.currentUser || hasTokenCookie);

      if (!isAuthenticated && !isPublic) {
        router.push('/login');
      }

      // Auto redirect authenticated users away from login/register to dashboard
      if (isAuthenticated && (pathname === '/login' || pathname === '/register' || pathname === '/signup')) {
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
        setFirebaseUser(result.user);
        setUser(buildFallbackUser(result.user));
        await syncUserWithBackend(result.user);
        router.push('/dashboard');
      }
    } catch (err) {
      setLoading(false);
      throw err;
    }
    setLoading(false);
  };

  // 2. Email / Username / Password Sign-in
  const loginWithEmail = async (emailOrUsername: string, pass: string) => {
    setLoading(true);
    const identifier = emailOrUsername.trim();

    // A. Try Firebase Auth if it contains @
    if (identifier.includes('@')) {
      try {
        const result = await signInWithEmailAndPassword(auth, identifier, pass);
        if (result.user) {
          setFirebaseUser(result.user);
          setUser(buildFallbackUser(result.user));
          await syncUserWithBackend(result.user);
          router.push('/dashboard');
          setLoading(false);
          return;
        }
      } catch (fbErr: any) {
        console.warn('Firebase email auth notice, trying database login:', fbErr?.code || fbErr);
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

  // 3. Email / Username / Password Sign-up
  const signUpWithEmail = async (emailOrUsername: string, pass: string, name?: string) => {
    setLoading(true);
    const identifier = emailOrUsername.trim();
    const cleanUsername = (identifier.includes('@') ? identifier.split('@')[0] : identifier).toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${Date.now().toString().slice(-4)}`;
    const effectiveEmail = identifier.includes('@') ? identifier : `${cleanUsername}@cupidxchat.in`;

    let fbSuccess = false;

    // A. Try Firebase Auth create user
    try {
      const result = await createUserWithEmailAndPassword(auth, effectiveEmail, pass);
      if (result.user) {
        setFirebaseUser(result.user);
        setUser(buildFallbackUser(result.user));
        await syncUserWithBackend(result.user);
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
