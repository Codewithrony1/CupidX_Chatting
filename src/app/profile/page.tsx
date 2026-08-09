'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
import BottomSheet from '@/components/ui/BottomSheet';
import {
  User,
  Camera,
  Crown,
  Sparkles,
  Lock,
  ArrowLeft,
  Check,
  Smile,
  Zap,
  Shield,
  Heart,
  Globe,
  Loader2,
  X
} from 'lucide-react';

const MOOD_OPTIONS = [
  '🤪 Crazy',
  '😎 Attitude',
  '✨ Fantastic',
  '🔥 Energetic',
  '😌 Chill',
  '😂 Funny',
  '💃 Glam',
  '👑 Royal',
  '📸 Model',
  '🎧 Vibing',
  '🚀 Motivated',
  '😴 Sleepy',
  '😊 Happy',
  '🧠 Thoughtful',
  '❤️ Romantic',
  '🌸 Cute',
  '👀 Curious',
  '💪 Confident',
];

const PERSONALITY_OPTIONS = [
  '💬 Talkative',
  '😂 Funny',
  '😊 Friendly',
  '😎 Chill',
  '🔥 Energetic',
  '🧠 Intelligent',
  '🎨 Creative',
  '🎮 Gamer',
  '🎵 Music Lover',
  '🚀 Ambitious',
  '🤪 Crazy',
  '❤️ Romantic',
];

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=CupidX1',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=CupidX2',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=CupidX3',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=CupidX4',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=CupidX5',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=CupidX6',
];

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const isVIP = user?.subscription?.isActive || user?.membershipTier === 'VIP';

  // Form States
  const [displayName, setDisplayName] = useState(user?.fullName || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [showBio, setShowBio] = useState(user?.profile?.showBio ?? true);
  const [gender, setGender] = useState(user?.profile?.gender || 'unspecified');
  const [showGender, setShowGender] = useState(user?.profile?.showGender ?? true);
  const [preferredGender, setPreferredGender] = useState(user?.profile?.preferredGender || 'auto');
  const [mood, setMood] = useState(user?.profile?.mood || '😎 Attitude');
  const [showMood, setShowMood] = useState(user?.profile?.showMood ?? true);
  const [moodDuration, setMoodDuration] = useState<'1hour' | '24hours' | 'never'>('24hours');

  // Personality Tags (array from comma-separated string)
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);

  // Avatar States
  const [avatarUrl, setAvatarUrl] = useState(user?.profile?.avatarUrl || '/default-avatar.png');
  const [avatarData, setAvatarData] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Modals & Bottom Sheets
  const [showVipLockModal, setShowVipLockModal] = useState(false);
  const [showMoodSheet, setShowMoodSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.profile) {
      setDisplayName(user.fullName || '');
      setBio(user.profile.bio || '');
      setShowBio(user.profile.showBio ?? true);
      setGender(user.profile.gender || 'unspecified');
      setShowGender(user.profile.showGender ?? true);
      setPreferredGender(user.profile.preferredGender || 'auto');
      setMood(user.profile.mood || '😎 Attitude');
      setShowMood(user.profile.showMood ?? true);
      setAvatarUrl(user.profile.avatarUrl || '/default-avatar.png');

      const tags = user.profile.personalityPreferences
        ? user.profile.personalityPreferences.split(',').filter(Boolean)
        : ['💬 Talkative', '😂 Funny', '😊 Friendly'];
      setPersonalityTags(tags);
    }
  }, [user]);

  // Client-side image crop & compression
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isVIP) {
      setShowVipLockModal(true);
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImagePreview(compressedDataUrl);
        setAvatarData(compressedDataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const togglePersonalityTag = (tag: string) => {
    setPersonalityTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio,
          showBio,
          gender,
          showGender,
          preferredGender,
          personalityPreferences: personalityTags.join(','),
          mood,
          showMood,
          moodDuration,
          avatarData: avatarData || undefined,
          avatarUrlPreset: !avatarData && avatarUrl ? avatarUrl : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSaveSuccess(true);
        await refreshUser();
        setTimeout(() => setSaveSuccess(false), 3000);
      } else if (res.status === 403 && data.isVipRequired) {
        setShowVipLockModal(true);
      } else {
        alert(data.error || 'Failed to save profile');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto w-full relative z-10 pb-16">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pink-500/20 pb-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-black text-white">Edit Profile</h1>
              <p className="text-xs text-pink-200/70">Personalize your Cupidx identity</p>
            </div>
          </div>

          <Link
            href="/vip"
            className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 border ${
              isVIP
                ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                : 'bg-white/5 text-yellow-400 border-yellow-500/30 hover:bg-white/10'
            }`}
          >
            <Crown className="w-3.5 h-3.5 fill-current" />
            <span>{isVIP ? '💎 VIP MEMBER' : '✨ GET VIP'}</span>
          </Link>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-6">
          
          {/* SECTION 1: PROFILE & DP */}
          <div className="glass-romantic rounded-3xl p-6 space-y-5 text-center relative border border-pink-500/25">
            <div className="relative w-24 h-24 mx-auto">
              <img
                src={imagePreview || avatarUrl}
                alt={user?.username || 'User Avatar'}
                className="w-24 h-24 rounded-full object-cover bg-slate-900 border-2 border-pink-400 shadow-xl"
              />

              <button
                type="button"
                onClick={() => {
                  if (!isVIP) {
                    setShowVipLockModal(true);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-gradient-to-tr from-pink-600 to-rose-500 text-white shadow-lg border border-white/20 hover:scale-110 transition-transform cursor-pointer"
                title={isVIP ? 'Change Profile Picture' : 'Custom DP requires VIP'}
              >
                {isVIP ? <Camera className="w-4 h-4" /> : <Lock className="w-4 h-4 text-yellow-300" />}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                className="hidden"
              />
            </div>

            <div>
              <h2 className="text-lg font-black text-white">@{user?.username}</h2>
              <p className="text-xs text-pink-200/70">{user?.fullName}</p>
            </div>

            {/* Avatar Preset Selector (VIP Exclusive Feature) */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-center space-x-1.5">
                <span className="text-[11px] font-bold text-pink-300 uppercase tracking-wider">
                  Avatar Presets
                </span>
                {!isVIP && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-extrabold border border-yellow-500/30 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> VIP
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center space-x-2">
                {AVATAR_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!isVIP) {
                        setShowVipLockModal(true);
                        return;
                      }
                      setAvatarUrl(preset);
                      setImagePreview(null);
                      setAvatarData('');
                    }}
                    className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-all cursor-pointer relative ${
                      avatarUrl === preset && !imagePreview
                        ? 'border-pink-400 scale-110 shadow-md'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={preset} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                    {!isVIP && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Lock className="w-3 h-3 text-yellow-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Username & Bio Fields */}
            <div className="space-y-3 text-left pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Username</label>
                <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-mono text-xs">
                  @{user?.username}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Bio</label>
                  <label className="flex items-center space-x-1.5 text-[11px] text-pink-200/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBio}
                      onChange={(e) => setShowBio(e.target.checked)}
                      className="rounded accent-pink-500"
                    />
                    <span>Show Bio</span>
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share a short intro about yourself..."
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: IDENTITY & GENDER (Requirement 6) */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <User className="w-4 h-4 text-purple-400" />
                <span>Identity & Gender</span>
              </h3>

              <label className="flex items-center space-x-1.5 text-xs text-pink-200/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showGender}
                  onChange={(e) => setShowGender(e.target.checked)}
                  className="rounded accent-pink-500"
                />
                <span>Show on profile</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'male', label: 'Male' },
                { id: 'female', label: 'Female' },
                { id: 'nonbinary', label: 'Non-binary' },
                { id: 'prefer_not_to_say', label: 'Prefer not to say' },
              ].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGender(g.id)}
                  className={`p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                    gender === g.id
                      ? 'bg-pink-500/25 border-pink-400 text-white shadow-md'
                      : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 3: CURRENT MOOD & EXPIRATION (VIP Feature) */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Smile className="w-4 h-4 text-amber-400" />
                <span>Current Mood</span>
                {!isVIP && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-extrabold border border-yellow-500/30 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> VIP
                  </span>
                )}
              </h3>

              <button
                type="button"
                onClick={() => {
                  if (!isVIP) {
                    setShowVipLockModal(true);
                  } else {
                    setShowMoodSheet(true);
                  }
                }}
                className="text-xs font-bold text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Change Mood</span>
                {!isVIP && <Lock className="w-3 h-3 text-yellow-400" />}
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-2xl leading-none">{mood.split(' ')[0]}</span>
                <span className="text-xs font-bold text-white">{mood}</span>
              </div>

              <span className="text-[10px] text-pink-200/60 font-semibold uppercase">Active</span>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Mood Duration</label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { id: '1hour', label: '1 Hour' },
                  { id: '24hours', label: '24 Hours (Today)' },
                  { id: 'never', label: 'Until Changed' },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      if (!isVIP) {
                        setShowVipLockModal(true);
                        return;
                      }
                      setMoodDuration(d.id as any);
                    }}
                    className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      moodDuration === d.id
                        ? 'bg-pink-500 text-white shadow-md'
                        : 'bg-white/5 border border-white/10 text-pink-200/70 hover:bg-white/10'
                    }`}
                  >
                    <span>{d.label}</span>
                    {!isVIP && <Lock className="w-2.5 h-2.5 text-yellow-400" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 4: PERSONALITY PREFERENCES (VIP Feature) */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span>Conversation Style & Personality</span>
                {!isVIP && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-extrabold border border-yellow-500/30 flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> VIP
                  </span>
                )}
              </h3>
            </div>

            <p className="text-xs text-pink-200/70">
              Select personality tags that describe you and your conversation style (VIP Exclusive).
            </p>

            <div className="flex flex-wrap gap-2">
              {PERSONALITY_OPTIONS.map((tag) => {
                const selected = personalityTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (!isVIP) {
                        setShowVipLockModal(true);
                        return;
                      }
                      togglePersonalityTag(tag);
                    }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      selected
                        ? 'bg-gradient-to-r from-pink-600 to-rose-500 text-white border-pink-400 shadow-md scale-105'
                        : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                    }`}
                  >
                    <span>{tag}</span>
                    {!isVIP && <Lock className="w-3 h-3 text-yellow-400" />}
                    {isVIP && selected && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 5: DISCOVERY PREFERENCES (Requirement 7 & 9) */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span>Discovery Preference</span>
              </h3>

              {!isVIP && (
                <span className="text-[10px] text-yellow-400 font-extrabold flex items-center gap-1">
                  <Lock className="w-3 h-3" /> VIP Feature
                </span>
              )}
            </div>

            <p className="text-xs text-pink-200/70">
              Who would you like to connect with in Random Chat? (Random matching prioritizes compatible users).
            </p>

            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { id: 'auto', label: 'Anyone' },
                { id: 'male', label: 'Men' },
                { id: 'female', label: 'Women' },
              ].map((p) => {
                const isLocked = p.id !== 'auto' && !isVIP;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (isLocked) {
                        setShowVipLockModal(true);
                        return;
                      }
                      setPreferredGender(p.id);
                    }}
                    className={`p-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      preferredGender === p.id
                        ? 'bg-pink-500/25 border-pink-400 text-white shadow-md'
                        : isLocked
                        ? 'bg-white/5 border-white/5 text-pink-200/40 hover:border-yellow-500/40'
                        : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                    }`}
                  >
                    <span>{p.label}</span>
                    {isLocked && <Lock className="w-3 h-3 text-yellow-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {saveSuccess && (
            <div className="p-3.5 rounded-2xl bg-green-500/15 border border-green-500/30 text-xs text-green-400 text-center font-bold flex items-center justify-center gap-1.5">
              <Check className="w-4 h-4" /> Profile updated successfully!
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-sm shadow-xl shadow-pink-500/30 transition-all cursor-pointer flex items-center justify-center space-x-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Profile...</span>
              </>
            ) : (
              <span>SAVE PROFILE</span>
            )}
          </button>
        </form>

      </div>

      {/* Mood Bottom Sheet */}
      <BottomSheet isOpen={showMoodSheet} onClose={() => setShowMoodSheet(false)} title="Select your mood">
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
            {MOOD_OPTIONS.map((m) => {
              const selected = mood === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMood(m);
                    setShowMoodSheet(false);
                  }}
                  className={`p-3 rounded-2xl border text-xs font-bold text-left flex items-center justify-between transition-all cursor-pointer ${
                    selected
                      ? 'bg-pink-500/25 border-pink-400 text-white shadow-md'
                      : 'bg-white/5 border-white/10 text-pink-200/80 hover:bg-white/10'
                  }`}
                >
                  <span>{m}</span>
                  {selected && <Check className="w-4 h-4 text-pink-400" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowMoodSheet(false)}
            className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            DONE
          </button>
        </div>
      </BottomSheet>

      {/* Free User VIP Feature Lock Modal (Requirement 15) */}
      {showVipLockModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-sm glass-premium rounded-3xl p-6 space-y-5 text-center relative border border-yellow-500/30 shadow-2xl">
            <button
              onClick={() => setShowVipLockModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-yellow-400 via-amber-500 to-yellow-600 flex items-center justify-center mx-auto text-slate-950 shadow-xl shadow-yellow-500/30 animate-pulse">
              <Crown className="w-7 h-7 fill-current" />
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[11px] font-extrabold uppercase tracking-wide">
                💎 VIP FEATURE
              </span>
              <h3 className="text-lg font-black text-white">This feature is available with Cupidx VIP.</h3>
              <p className="text-xs text-pink-200/70 leading-relaxed px-2">
                Unlock custom DP uploads, targeted gender discovery, talkative matchmaking & VIP profile badge.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <Link
                href="/vip"
                onClick={() => setShowVipLockModal(false)}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:to-amber-400 text-slate-950 font-black text-xs shadow-lg transition-all active:scale-95 cursor-pointer block text-center"
              >
                EXPLORE VIP
              </Link>

              <button
                onClick={() => setShowVipLockModal(false)}
                className="w-full py-2.5 rounded-2xl text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
