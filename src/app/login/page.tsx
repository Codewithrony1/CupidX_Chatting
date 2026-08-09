'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useClerk, useSignIn, useSignUp, useUser } from '@clerk/nextjs';
import { Heart, Mail, Lock, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function Login() {
  const router = useRouter();
  const { user: contextUser } = useAuth();
  const clerk = useClerk();
  const { isLoaded: clerkLoaded } = useUser();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect to /dashboard
  useEffect(() => {
    if (contextUser?.username) {
      router.push('/dashboard');
    }
  }, [contextUser, router]);

  // Handle Google OAuth via Clerk
  const handleGoogleSignIn = () => {
    if (!clerk) return;
    setError('');
    try {
      clerk.openSignIn({
        fallbackRedirectUrl: '/onboarding',
        signUpFallbackRedirectUrl: '/onboarding',
      });
    } catch (err: any) {
      console.error(err);
      setError('Unable to open Google sign in. Please try again.');
    }
  };

  // Handle Email Sign In / Sign Up via Clerk
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn || !signUp || !email) return;
    setError('');
    setLoading(true);

    try {
      // Attempt Sign In
      const result: any = await signIn.create({
        identifier: email,
        password: password || 'DefaultCupidxPass123!',
      });

      if (result?.status === 'complete') {
        router.push('/onboarding');
      } else {
        setError('Please check your email for authentication instructions.');
      }
    } catch (err: any) {
      // If user doesn't exist, create sign up
      if (err?.errors?.[0]?.code === 'form_identifier_not_found') {
        try {
          const signUpResult: any = await signUp.create({
            emailAddress: email,
            password: password || 'DefaultCupidxPass123!',
          });
          if (signUpResult?.status === 'complete') {
            router.push('/onboarding');
          } else {
            setError('Please verify your email address to continue.');
          }
        } catch (signUpErr: any) {
          setError(signUpErr?.errors?.[0]?.message || 'Unable to create account with email.');
        }
      } else {
        setError(err?.errors?.[0]?.message || 'Unable to sign in with email.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0014] flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-pink-500 selection:text-white">
      <FloatingHearts />

      <div className="w-full max-w-md space-y-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex items-center space-x-2 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-pink-500/40 group-hover:scale-110 transition-transform">
              <Heart className="w-7 h-7 text-white fill-white animate-pulse" />
            </div>
            <span className="text-3xl font-black tracking-wider bg-gradient-to-r from-white via-pink-100 to-rose-300 bg-clip-text text-transparent">
              Cupidx
            </span>
          </Link>
          <p className="text-xs font-bold text-pink-200/70 tracking-wide uppercase">
            Meet. Chat. Move on.
          </p>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 text-center font-bold animate-in fade-in duration-200">
            {error}
          </div>
        )}

        {/* Main Auth Form Container */}
        <div className="glass-romantic rounded-3xl p-6 space-y-5 border border-pink-500/30 shadow-2xl">
          
          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center space-x-3 shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.15C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.29C.47 8.2.0 10.05.0 12s.47 3.8 1.29 5.42l3.99-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24.0 12 .0 7.31.0 3.26 2.7 1.29 6.58l3.99 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center space-x-3 text-pink-200/40 text-xs">
            <div className="flex-1 h-px bg-pink-500/20" />
            <span>or email</span>
            <div className="flex-1 h-px bg-pink-500/20" />
          </div>

          {/* Email Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-pink-300 uppercase tracking-wider block">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-pink-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-2xl glass-input text-xs text-white placeholder:text-pink-300/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-pink-300 uppercase tracking-wider block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-pink-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-2xl glass-input text-xs text-white placeholder:text-pink-300/40"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white shadow-xl shadow-pink-500/30 transition-all text-xs flex items-center justify-center space-x-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span>Continue to Cupidx</span>
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Footer Legal Terms */}
        <p className="text-[11px] text-pink-200/50 text-center leading-relaxed">
          By continuing, you agree to Cupidx's{' '}
          <Link href="/terms" className="text-pink-300 hover:text-white underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-pink-300 hover:text-white underline">
            Privacy Policy
          </Link>.
        </p>

      </div>
    </div>
  );
}
