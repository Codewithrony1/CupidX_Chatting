'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { updateFirestoreUserProfile, calculateAge } from '@/lib/firestoreUser';
import { Heart, User, Calendar, Smile, ArrowRight, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading: authLoading, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | 'prefer_not_to_say'>('male');
  const [selectedEmoji, setSelectedEmoji] = useState('😊');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [success, setSuccess] = useState(false);

  // Pre-fill existing data if available
  useEffect(() => {
    if (user) {
      if (user.fullName && user.fullName !== 'CupidX User') {
        setDisplayName(user.fullName);
      } else if (user.displayName && user.displayName !== 'CupidX User') {
        setDisplayName(user.displayName);
      }

      if (user.dateOfBirth || user.profile?.dateOfBirth) {
        setDateOfBirth(user.dateOfBirth || user.profile?.dateOfBirth || '');
      }

      if (user.gender && user.gender !== 'unspecified') {
        setGender(user.gender as any);
      } else if (user.profile?.gender && user.profile.gender !== 'unspecified') {
        setGender(user.profile.gender as any);
      }

      if (user.profile?.avatarEmoji) {
        setSelectedEmoji(user.profile.avatarEmoji);
      }
    }
  }, [user]);

  // If already complete, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      const isComplete = Boolean(
        user.profileCompleted ||
        (user.profile?.ageGenderConfirmed && user.gender && user.gender !== 'unspecified' && (user.dateOfBirth || user.profile?.dateOfBirth))
      );
      if (isComplete && !submitting && !success) {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, submitting, success, router]);

  // Calculated dynamic age
  const dynamicAge = dateOfBirth ? calculateAge(dateOfBirth) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    if (!dateOfBirth) {
      setErrorMsg('Please enter your date of birth.');
      return;
    }

    // Validate DOB
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      setErrorMsg('Please enter a valid date of birth.');
      return;
    }

    const today = new Date();
    if (birthDate > today) {
      setErrorMsg('Date of birth cannot be in the future.');
      return;
    }

    const age = calculateAge(dateOfBirth);
    if (age < 18) {
      setErrorMsg('You must be at least 18 years old to use CupidX.');
      return;
    }

    if (!gender) {
      setErrorMsg('Please select your gender.');
      return;
    }

    const effectiveUsername = (user?.username || (displayName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || `user_${Date.now().toString().slice(-4)}`));

    setSubmitting(true);
    setErrorMsg('');

    try {
      const uid = firebaseUser?.uid || user?.id;

      // 1. Save directly to Cloud Firestore
      if (uid) {
        await updateFirestoreUserProfile(uid, {
          fullName: displayName.trim(),
          displayName: displayName.trim(),
          username: effectiveUsername,
          usernameLower: effectiveUsername.toLowerCase(),
          dateOfBirth,
          gender,
          profileCompleted: true,
          profile: {
            bio: user?.profile?.bio || 'Hey there! I am using CupidX.',
            dateOfBirth,
            gender,
            age,
            avatarEmoji: selectedEmoji,
            avatarType: 'EMOJI',
            ageGenderConfirmed: true,
            themePreference: 'purple',
            randomChatIntroSeen: true,
            interests: '',
          },
        });
      }

      // 2. Background sync with backend
      fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: effectiveUsername,
          displayName: displayName.trim(),
          avatarEmoji: selectedEmoji,
          dob: dateOfBirth,
          gender,
        }),
      }).catch(() => {});

      setSuccess(true);
      await refreshUser();

      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.replace('/dashboard');
        } else {
          router.replace('/dashboard');
        }
      }, 500);
    } catch (err: any) {
      console.error('Onboarding save error:', err);
      setErrorMsg(err?.message || 'Failed to complete profile setup. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0014] text-white flex flex-col justify-center items-center p-4 relative overflow-x-hidden selection:bg-pink-500 selection:text-white">
      <FloatingHearts />

      <div className="w-full max-w-md glass-romantic rounded-3xl p-6 sm:p-8 space-y-6 z-10 border border-pink-500/30 shadow-2xl shadow-pink-500/20 my-6 backdrop-blur-xl">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center mx-auto shadow-lg shadow-pink-500/40">
            <Heart className="w-7 h-7 text-white fill-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Let&apos;s set up your profile</h1>
          <p className="text-xs text-pink-200/80">Tell us a little about yourself before you start connecting.</p>
        </div>

        {success ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-white">Profile ready ✨</h3>
            <p className="text-xs text-slate-400">Opening your dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* 1. Full Name */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold text-pink-200 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-pink-400" />
                <span>FULL NAME</span>
              </label>
              <input
                type="text"
                required
                placeholder="Enter your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl glass-input text-xs sm:text-sm text-white placeholder:text-pink-300/40 focus:outline-none focus:ring-1 focus:ring-pink-500 font-semibold"
              />
            </div>

            {/* 2. Date of Birth */}
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-pink-200 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  <span>DATE OF BIRTH</span>
                </label>
                {dynamicAge !== null && dynamicAge >= 18 && (
                  <span className="text-[11px] font-extrabold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Age: {dynamicAge} yrs
                  </span>
                )}
              </div>
              <input
                type="date"
                required
                max={new Date().toISOString().split('T')[0]}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl glass-input text-xs sm:text-sm text-white focus:outline-none focus:ring-1 focus:ring-pink-500 font-semibold cursor-pointer"
              />
              <p className="text-[10px] text-pink-200/50">Must be at least 18 years old. DOB cannot be changed for Free members.</p>
            </div>

            {/* 3. Gender */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold text-pink-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-pink-400" />
                <span>GENDER</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Male', val: 'male' },
                  { label: 'Female', val: 'female' },
                  { label: 'Other', val: 'other' },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setGender(item.val as any)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      gender === item.val
                        ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white border-pink-400 shadow-md scale-[1.02]'
                        : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Choose Avatar Emoji */}
            <div className="space-y-1.5 text-left pt-1">
              <label className="text-xs font-bold text-pink-200 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5 text-pink-400" />
                  <span>Choose Avatar Emoji</span>
                </span>
                <span className="text-[10px] text-pink-300/60 font-semibold">2 Free</span>
              </label>

              <div className="p-3 rounded-2xl bg-white/5 border border-pink-500/20 flex items-center justify-center space-x-4">
                {['😊', '😎'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={`w-12 h-12 rounded-2xl text-2xl flex items-center justify-center transition-all cursor-pointer select-none ${
                      selectedEmoji === emoji
                        ? 'bg-gradient-to-tr from-pink-600 to-rose-500 border-2 border-pink-300 shadow-xl scale-110'
                        : 'bg-white/5 hover:bg-white/10 border border-white/10 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 font-bold text-center leading-relaxed">
                {errorMsg}
              </div>
            )}

            {/* Primary Submit Button */}
            <button
              type="submit"
              disabled={submitting || !displayName.trim() || !dateOfBirth}
              className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white shadow-xl shadow-pink-500/30 flex items-center justify-center space-x-2 text-sm disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer active:scale-95"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
