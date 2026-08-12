'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useClerk, useUser } from '@clerk/nextjs';

interface User {
  id: string;
  clerkUserId?: string | null;
  username: string;
  fullName: string;
  displayName?: string;
  role: 'USER' | 'ADMIN';
  membershipTier?: string;
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
  };
  subscription?: {
    isActive: boolean;
    plan: string;
    endDate?: string;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (userData: any) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const clerk = useClerk();
  const { isSignedIn, isLoaded: clerkLoaded } = useUser();

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
        }
      } else {
        setUser(null);
      }
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clerkLoaded) {
      refreshUser();
    }
  }, [clerkLoaded, isSignedIn]);

  // Client-side Strict Route Protection Guard
  useEffect(() => {
    if (!loading && clerkLoaded) {
      const publicPaths = ['/', '/login', '/register', '/signup', '/privacy', '/terms', '/sso-callback'];
      const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));

      const hasTokenCookie = typeof document !== 'undefined' && document.cookie.includes('token=');

      if (!user && !isSignedIn && !hasTokenCookie && !isPublic) {
        router.push('/login');
      }

      // Auto redirect authenticated users away from auth pages (/login, /register, /signup, /onboarding) to /dashboard
      if ((user || isSignedIn) && (pathname === '/login' || pathname === '/register' || pathname === '/signup' || pathname === '/onboarding')) {
        router.push('/dashboard');
      }
    }
  }, [loading, user, isSignedIn, pathname, clerkLoaded, router]);

  const login = (userData: any) => {
    setUser(userData);
    router.push('/dashboard');
  };

  const logout = async () => {
    try {
      if (clerk) {
        await clerk.signOut();
      }
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      router.push('/login');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
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
