'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Heart, Sparkles, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // If user already has a Cupidx username, redirect instantly to /dashboard
  useEffect(() => {
    if (user?.username) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  if (user?.username) {
    return (
      <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
        <FloatingHearts />
        <div className="text-center space-y-3 z-10">
          <Loader2 className="w-10 h-10 text-pink-500 animate-spin mx-auto" />
          <p className="text-xs font-bold text-pink-300">Redirecting to Dashboard...</p>
        </div>
      </div>
    );
  }

  // Live Debounced Username Availability Check
  useEffect(() => {
    if (!username || username.trim().length < 3) {
      setAvailable(null);
      setErrorMsg('');
      return;
    }

    setChecking(true);
    setErrorMsg('');

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/onboarding?username=${encodeURIComponent(username.trim())}`);
        const data = await res.json();

        if (data.available) {
          setAvailable(true);
          setErrorMsg('');
        } else {
          setAvailable(false);
          setErrorMsg(data.reason || 'Username is already taken');
        }
      } catch (e) {
        console.error(e);
        setAvailable(false);
        setErrorMsg('Unable to check username');
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!available || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();
      if (res.ok && (data.success || data.user)) {
        await refreshUser();
        router.push('/dashboard');
      } else {
        alert(data.error || 'Failed to set username');
      }
    } catch (e) {
      console.error(e);
      alert('An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0d0014] text-white flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-pink-500 selection:text-white">
      <FloatingHearts />

      <div className="w-full max-w-md mx-auto space-y-6 relative z-10 animate-in fade-in zoom-in duration-300">
        {/* App Logo */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center mx-auto shadow-xl shadow-pink-500/40 animate-pulse">
            <Heart className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Welcome to Cupid<span className="text-pink-400">X</span> 👋
          </h1>
          <p className="text-xs text-pink-200/70">
            Choose a unique handle for your 1-to-1 ephemeral chats
          </p>
        </div>

        {/* Onboarding Form Card */}
        <form onSubmit={handleSubmit} className="glass-romantic rounded-3xl p-6 space-y-5 border border-pink-500/30">
          <div className="space-y-2">
            <label className="text-xs font-bold text-pink-300 uppercase tracking-wider block">
              Choose your @username
            </label>

            <div className="relative">
              <span className="absolute left-4 top-3.5 text-pink-400 font-bold text-base">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                maxLength={20}
                required
                className="w-full pl-9 pr-10 py-3.5 rounded-2xl glass-input text-base font-mono text-white placeholder:text-pink-300/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
              />

              <div className="absolute right-3.5 top-3.5">
                {checking && <Loader2 className="w-5 h-5 text-pink-400 animate-spin" />}
                {!checking && available === true && <CheckCircle className="w-5 h-5 text-emerald-400" />}
                {!checking && available === false && <XCircle className="w-5 h-5 text-rose-400" />}
              </div>
            </div>

            {/* Live Availability Messages */}
            <div className="min-h-[20px] text-xs font-medium">
              {checking && <span className="text-pink-300/70 animate-pulse">Checking availability...</span>}
              {!checking && available === true && (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  ✓ @{username} is available!
                </span>
              )}
              {!checking && available === false && (
                <span className="text-rose-400 font-bold flex items-center gap-1">
                  ✕ {errorMsg}
                </span>
              )}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/5 border border-pink-500/15 text-[11px] text-pink-200/70 space-y-1">
            <p className="font-bold text-pink-300">Username rules:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>3 to 20 characters</li>
              <li>Letters, numbers, and underscores only</li>
              <li>Case-insensitive uniqueness</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={!available || submitting || checking}
            className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white shadow-xl shadow-pink-500/30 transition-all text-base flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Creating profile...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>Continue to Home</span>
                <ArrowRight className="w-5 h-5" />
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
