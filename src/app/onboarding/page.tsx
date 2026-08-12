'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Heart, Sparkles, Check, X, Loader2, User, Smile, ArrowRight } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

const EMOJI_AVATARS = ['😊', '😎', '😄', '🤪', '🥰', '😇', '😈', '🤩', '😌', '🥳', '🤠', '😍', '🫡'];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName || user?.fullName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [selectedEmoji, setSelectedEmoji] = useState(user?.profile?.avatarEmoji || '😊');

  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // If user already has username set and completed onboarding, redirect to dashboard
  useEffect(() => {
    if (user && user.username && !user.username.startsWith('user_')) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // Real-time username availability check
  useEffect(() => {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    if (!clean || clean.length < 3) {
      setAvailable(null);
      setReason('');
      return;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`/api/auth/onboarding?username=${encodeURIComponent(clean)}`);
        const data = await res.json();
        if (res.ok && data.available) {
          setAvailable(true);
          setReason('✓ @' + clean + ' is available');
        } else {
          setAvailable(false);
          setReason('✕ ' + (data.reason || 'Username already taken'));
        }
      } catch (e) {
        setAvailable(false);
        setReason('✕ Error checking username');
      } finally {
        setChecking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || submitting || available === false) return;

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          avatarEmoji: selectedEmoji,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await refreshUser();
        router.replace('/dashboard');
      } else {
        setErrorMsg(data.error || 'Failed to complete profile setup.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0014] text-white flex flex-col justify-center items-center p-4 relative overflow-x-hidden">
      <FloatingHearts />

      <div className="w-full max-w-md glass-romantic rounded-3xl p-6 sm:p-8 space-y-6 z-10 border border-pink-500/30 shadow-2xl shadow-pink-500/20">
        
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center mx-auto shadow-lg shadow-pink-500/40">
            <Heart className="w-7 h-7 text-white fill-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Welcome to CupidX 👋</h1>
          <p className="text-xs text-pink-200/80">Choose your display name, unique username & emoji DP</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* 1. Emoji DP Selector Grid */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-pink-200 flex items-center gap-1.5">
              <Smile className="w-4 h-4 text-pink-400" />
              <span>Choose your Emoji Profile Picture</span>
            </label>

            <div className="p-3 rounded-2xl bg-white/5 border border-pink-500/20 flex flex-wrap justify-center gap-2">
              {EMOJI_AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`w-10 h-10 rounded-xl text-2xl flex items-center justify-center transition-all cursor-pointer select-none ${
                    selectedEmoji === emoji
                      ? 'bg-gradient-to-tr from-pink-600 to-rose-500 border-2 border-pink-300 shadow-lg scale-110'
                      : 'bg-white/5 hover:bg-white/10 border border-white/10 opacity-70 hover:opacity-100'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Display Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-pink-200 flex items-center gap-1.5">
              <User className="w-4 h-4 text-purple-400" />
              <span>Display Name</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Rony Rai"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl glass-input text-xs sm:text-sm text-white placeholder:text-pink-300/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
            <p className="text-[10px] text-pink-200/50">Your name visible to people you chat with.</p>
          </div>

          {/* 3. Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-pink-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span>Unique @username</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-sm font-bold text-pink-400">@</span>
              <input
                type="text"
                placeholder="rony"
                value={username.replace(/^@/, '')}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={20}
                required
                className="w-full pl-8 pr-10 py-3 rounded-2xl glass-input text-xs sm:text-sm text-white placeholder:text-pink-300/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50 font-mono font-bold"
              />
              <div className="absolute right-3 top-3">
                {checking && <Loader2 className="w-4 h-4 text-pink-400 animate-spin" />}
                {!checking && available === true && <Check className="w-4 h-4 text-emerald-400" />}
                {!checking && available === false && <X className="w-4 h-4 text-rose-400" />}
              </div>
            </div>

            {reason && (
              <p className={`text-[11px] font-bold ${available ? 'text-emerald-400' : 'text-rose-400'}`}>
                {reason}
              </p>
            )}
            <p className="text-[10px] text-pink-200/50">3–20 characters. Letters, numbers and _ allowed.</p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 font-bold text-center">
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || checking || available === false || !username.trim()}
            className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white shadow-xl shadow-pink-500/30 flex items-center justify-center space-x-2 text-sm disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer active:scale-95"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Complete Profile & Start Chatting</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

        </form>

      </div>
    </div>
  );
}
