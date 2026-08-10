'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useClerk, useSignUp } from '@clerk/nextjs';
import { Heart, Mail, Lock, ArrowRight, ShieldCheck, KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function Register() {
  const router = useRouter();
  const { user: contextUser } = useAuth();
  const clerk = useClerk();
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp() as any;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If user already authenticated, redirect to /dashboard
  useEffect(() => {
    if (contextUser?.username) {
      router.replace('/dashboard');
    }
  }, [contextUser, router]);

  // Handle Google OAuth Sign-Up via Clerk
  const handleGoogleSignUp = () => {
    if (!clerk) return;
    setError('');
    try {
      clerk.openSignUp({
        fallbackRedirectUrl: '/dashboard',
        signInFallbackRedirectUrl: '/dashboard',
      });
    } catch (err: any) {
      console.error(err);
      setError('Unable to open Google sign up. Please try again.');
    }
  };

  // Handle Email Registration via Clerk
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded || !signUp || !email || !password) return;
    setError('');
    setLoading(true);

    try {
      // 1. Create Clerk Sign Up
      await signUp.create({
        emailAddress: email,
        password: password,
      });

      // 2. Send Email Verification Code
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setVerifying(true);
    } catch (err: any) {
      console.error(err);
      setError(err?.errors?.[0]?.message || 'Failed to create account with email.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Verification OTP Code Submission
  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpLoaded || !signUp || !code) return;
    setError('');
    setLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        router.push('/dashboard');
      } else {
        setError('Verification incomplete. Please check your verification code.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.errors?.[0]?.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0d0014] text-white flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-pink-500 selection:text-white">
      <FloatingHearts />

      <div className="w-full max-w-md space-y-6 relative z-10 animate-in fade-in duration-300">
        
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
            Create account & start chatting
          </p>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 text-center font-bold animate-in fade-in duration-200">
            {error}
          </div>
        )}

        {/* Form Container */}
        <div className="glass-romantic rounded-3xl p-6 space-y-5 border border-pink-500/30 shadow-2xl">
          
          {!verifying ? (
            <>
              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={handleGoogleSignUp}
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
                <span>Sign up with Google</span>
              </button>

              <div className="flex items-center space-x-3 text-pink-200/40 text-xs">
                <div className="flex-1 h-px bg-pink-500/20" />
                <span>or email</span>
                <div className="flex-1 h-px bg-pink-500/20" />
              </div>

              {/* Email & Password Registration Form */}
              <form onSubmit={handleEmailSignUp} className="space-y-4">
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
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
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
                      <Loader2 className="w-4 h-4 animate-spin" /> Creating account...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>Create Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Verification Code Input Screen */
            <form onSubmit={handleVerificationSubmit} className="space-y-5 animate-in fade-in duration-200">
              <div className="text-center space-y-1">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center mx-auto border border-pink-500/30">
                  <Mail className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Verify Your Email</h3>
                <p className="text-xs text-pink-200/70">
                  We sent a 6-digit verification code to <span className="text-white font-semibold">{email}</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-pink-300 uppercase tracking-wider block text-center">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  className="w-full py-3.5 rounded-2xl glass-input text-center text-lg font-mono text-white tracking-widest placeholder:text-pink-300/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white shadow-xl shadow-pink-500/30 transition-all text-xs flex items-center justify-center space-x-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Verify & Continue</span>
                  </span>
                )}
              </button>
            </form>
          )}

          {/* Toggle between Sign In / Sign Up */}
          <div className="text-center pt-2 border-t border-pink-500/15">
            <p className="text-xs text-pink-200/70">
              Already have a Cupidx account?{' '}
              <Link href="/login" className="font-bold text-pink-400 hover:text-white underline">
                Sign In
              </Link>
            </p>
          </div>
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
