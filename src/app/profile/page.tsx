'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { VIP_AVATAR_CATEGORIES } from '@/lib/avatars';
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

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  // Form States
  const [displayName, setDisplayName] = useState(user?.displayName || user?.fullName || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [showBio, setShowBio] = useState(user?.profile?.showBio ?? true);
  const [age, setAge] = useState<number>(user?.profile?.age || 18);
  const [gender, setGender] = useState<string>(user?.profile?.gender || 'unspecified');
  const ageGenderConfirmed = user?.profile?.ageGenderConfirmed ?? false;
  const ageGenderChangesCount = user?.profile?.ageGenderChangesCount ?? 0;
  const [showGender, setShowGender] = useState(user?.profile?.showGender ?? true);
  const [preferredGender, setPreferredGender] = useState(user?.profile?.preferredGender || 'auto');
  const [mood, setMood] = useState(user?.profile?.mood || '');
  const [showMood, setShowMood] = useState(user?.profile?.showMood ?? true);
  const [moodDuration, setMoodDuration] = useState<'1hour' | '24hours' | 'never'>('24hours');

  // Personality Tags (array from comma-separated string)
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);
  const [avatarType, setAvatarType] = useState<string>(user?.profile?.avatarType || 'EMOJI');
  const [avatarEmoji, setAvatarEmoji] = useState<string>(user?.profile?.avatarEmoji || '😊');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.profile?.avatarUrl || null);
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
      setDisplayName(user.displayName || user.fullName || '');
      setBio(user.profile.bio || '');
      setShowBio(user.profile.showBio ?? true);
      setAge(user.profile.age || 18);
      setGender(user.profile.gender || 'unspecified');
      setShowGender(user.profile.showGender ?? true);
      setPreferredGender(user.profile.preferredGender || 'auto');
      setMood(user.profile.mood || '');
      setShowMood(user.profile.showMood ?? true);
      setAvatarType(user.profile.avatarType || 'EMOJI');
      setAvatarEmoji(user.profile.avatarEmoji || '😊');
      setAvatarUrl(user.profile.avatarUrl || null);

      const tags = user.profile.personalityPreferences
        ? user.profile.personalityPreferences.split(',').filter(Boolean)
        : [];
      setPersonalityTags(tags);
    }
  }, [user]);

  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/payments/history')
      .then((res) => res.json())
      .then((data) => {
        if (data.payments) setPayments(data.payments);
      })
      .catch(console.error);
  }, []);

  // Client-side image crop & compression
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isVIP) {
      setShowVipLockModal(true);
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxDim = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        setImagePreview(compressedBase64);
        setAvatarData(compressedBase64);
        setAvatarType('IMAGE');
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
          displayName,
          bio,
          showBio,
          age,
          gender,
          showGender,
          preferredGender,
          personalityPreferences: personalityTags.join(','),
          mood,
          showMood,
          moodDuration,
          avatarType,
          avatarEmoji,
          avatarData: avatarData || undefined,
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
          
          {/* SECTION 1: CUPIDX IDENTITY & AVATAR */}
          <div className="glass-romantic rounded-3xl p-6 text-center space-y-5">
            
            {/* Avatar Render Box (Emoji or Custom Image) */}
            <div className="relative w-28 h-28 mx-auto">
              {isVIP && avatarType === 'IMAGE' && (imagePreview || avatarUrl) ? (
                <img
                  src={imagePreview || avatarUrl!}
                  alt={user?.username || 'User Avatar'}
                  className="w-28 h-28 rounded-3xl object-cover bg-slate-900 border-2 border-pink-400 shadow-xl"
                />
              ) : (
                <div className="w-28 h-28 rounded-3xl bg-gradient-to-tr from-pink-600/30 to-purple-600/30 border-2 border-pink-400/50 shadow-xl flex items-center justify-center text-6xl select-none">
                  {avatarEmoji}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!isVIP) {
                    setShowVipLockModal(true);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                className="absolute -bottom-1 -right-1 p-2 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 text-white shadow-lg border border-white/20 hover:scale-110 transition-transform cursor-pointer"
                title={isVIP ? 'Upload Custom Image DP' : 'Custom Image DP requires VIP'}
              >
                {isVIP ? <Camera className="w-4 h-4" /> : <Lock className="w-4 h-4 text-yellow-300" />}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (!isVIP) {
                    setShowVipLockModal(true);
                    return;
                  }
                  handleImageFileChange(e);
                }}
                className="hidden"
              />
            </div>

            <div>
              <h2 className="text-xl font-black text-white">{displayName || user?.username}</h2>
              <p className="text-xs text-pink-200/70 font-semibold">@{user?.username}</p>
            </div>

            {/* Avatar Selector Section */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block text-center">
                Choose Avatar
              </label>

              {!isVIP ? (
                /* FREE USER AVATAR PICKER: 😊 and 😎 ONLY */
                <div className="space-y-3">
                  <div className="flex items-center justify-center space-x-3">
                    {['😊', '😎'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setAvatarEmoji(emoji);
                          setAvatarType('EMOJI');
                        }}
                        className={`w-12 h-12 rounded-2xl text-2xl flex items-center justify-center transition-all cursor-pointer select-none ${
                          avatarEmoji === emoji && avatarType === 'EMOJI'
                            ? 'bg-gradient-to-tr from-pink-600 to-rose-500 border-2 border-pink-300 shadow-xl scale-110'
                            : 'bg-white/5 hover:bg-white/10 border border-white/10 opacity-60 hover:opacity-100'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  <div className="p-3 rounded-2xl bg-white/5 border border-pink-500/20 text-center space-y-1.5">
                    <p className="text-[11px] font-semibold text-pink-200/80">
                      💎 Unlock 25+ Premium Avatars & Custom Image DP with CupidX VIP
                    </p>
                    <Link
                      href="/vip"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 text-slate-950 font-black text-xs shadow-md hover:scale-105 transition-all"
                    >
                      <Crown className="w-3.5 h-3.5 fill-current" />
                      <span>Explore VIP →</span>
                    </Link>
                  </div>
                </div>
              ) : (
                /* VIP USER CATEGORIZED AVATAR PICKER */
                <div className="space-y-4">
                  {/* Avatar Mode Selector (Emoji vs Custom Image) */}
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAvatarType('EMOJI')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                        avatarType === 'EMOJI'
                          ? 'bg-pink-500 text-white shadow-md'
                          : 'bg-white/5 border border-white/10 text-pink-200/60 hover:bg-white/10'
                      }`}
                    >
                      😎 Emoji Avatar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarType('IMAGE');
                        if (!avatarUrl && !imagePreview) {
                          fileInputRef.current?.click();
                        }
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                        avatarType === 'IMAGE'
                          ? 'bg-pink-500 text-white shadow-md'
                          : 'bg-white/5 border border-white/10 text-pink-200/60 hover:bg-white/10'
                      }`}
                    >
                      🖼 Custom Image
                    </button>
                  </div>

                  {avatarType === 'EMOJI' ? (
                    <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                      {VIP_AVATAR_CATEGORIES.map((cat) => (
                        <div key={cat.name} className="space-y-1 text-left">
                          <span className="text-[10px] font-extrabold text-yellow-300 uppercase tracking-wider block px-1">
                            {cat.name}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {cat.emojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => setAvatarEmoji(emoji)}
                                className={`w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all cursor-pointer select-none ${
                                  avatarEmoji === emoji
                                    ? 'bg-gradient-to-tr from-yellow-500 to-amber-400 text-slate-950 border-2 border-yellow-200 shadow-md scale-110'
                                    : 'bg-white/5 hover:bg-white/10 border border-white/10 opacity-70 hover:opacity-100'
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2 text-center">
                      <p className="text-xs text-pink-200/80">Custom image is set as active profile picture.</p>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-xl bg-pink-500/20 text-pink-300 font-bold text-xs border border-pink-500/30 hover:bg-pink-500/30 transition-colors"
                        >
                          Replace Image
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarType('EMOJI');
                            setImagePreview(null);
                            setAvatarData('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 font-bold text-xs border border-rose-500/30 hover:bg-rose-500/30 transition-colors"
                        >
                          Remove Image
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Display Name & Username Edit Fields */}
            <div className="space-y-3 text-left pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Cupidx Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Rony Rai"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                />
                <p className="text-[10px] text-pink-200/60">Your display name shown on chat headers and profile sheets.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Unique @username</label>
                <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-mono text-xs">
                  @{user?.username}
                </div>
                <p className="text-[10px] text-pink-200/60 font-medium">Username is set once during setup and cannot be changed.</p>
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

          {/* SECTION 2: IDENTITY, AGE & GENDER */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <User className="w-4 h-4 text-purple-400" />
                <span>Identity, Age & Gender</span>
              </h3>

              {isVIP ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-extrabold border border-yellow-500/30 flex items-center gap-1">
                  <Crown className="w-3 h-3 fill-current" /> Unlimited Edits 💎
                </span>
              ) : (
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold border ${
                  ageGenderChangesCount >= 1
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  {ageGenderChangesCount >= 1 ? '0 edits left (Max 1 Free edit)' : '1 edit left (Free)'}
                </span>
              )}
            </div>

            {/* Age Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Age (18+)</label>
              <input
                type="number"
                min={18}
                max={99}
                value={age}
                onChange={(e) => {
                  if (!isVIP && ageGenderConfirmed && ageGenderChangesCount >= 1 && parseInt(e.target.value) !== user?.profile?.age) {
                    setShowVipLockModal(true);
                    return;
                  }
                  setAge(Math.min(99, Math.max(18, parseInt(e.target.value) || 18)));
                }}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-bold"
              />
            </div>

            {/* Gender Selection */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Gender</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'male', label: 'Male' },
                  { id: 'female', label: 'Female' },
                  { id: 'non-binary', label: 'Non-binary' },
                  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
                ].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      if (!isVIP && ageGenderConfirmed && ageGenderChangesCount >= 1 && g.id !== user?.profile?.gender) {
                        setShowVipLockModal(true);
                        return;
                      }
                      setGender(g.id);
                    }}
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
          </div>

          {/* SECTION 3: CURRENT MOOD & EXPIRATION (VIP vs FREE) */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Smile className="w-4 h-4 text-amber-400" />
                <span>Current Mood</span>
                {isVIP && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-black border border-yellow-500/30 flex items-center gap-1">
                    <Crown className="w-3 h-3 fill-current" /> 💎 VIP
                  </span>
                )}
              </h3>

              {isVIP && (
                <button
                  type="button"
                  onClick={() => setShowMoodSheet(true)}
                  className="text-xs font-bold text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Change Mood</span>
                </button>
              )}
            </div>

            {/* FREE USER MOOD CARD */}
            {!isVIP ? (
              <div className="p-4 rounded-2xl bg-white/5 border border-pink-500/15 text-center space-y-2">
                <p className="text-xs font-bold text-pink-200/80">
                  {mood ? mood : '😊 Choose your mood'}
                </p>
                <p className="text-[11px] text-pink-300/60">
                  Custom mood selection and expiration timers are available with CupidX VIP.
                </p>
                <Link
                  href="/vip"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 text-slate-950 font-black text-xs shadow-md hover:scale-105 transition-all mt-1"
                >
                  <Crown className="w-3.5 h-3.5 fill-current" />
                  <span>Explore VIP →</span>
                </Link>
              </div>
            ) : (
              /* VIP USER MOOD CONTROLS */
              <>
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl leading-none">{mood ? mood.split(' ')[0] : '😊'}</span>
                    <span className="text-xs font-bold text-white">{mood || 'No mood selected'}</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Active</span>
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
                        onClick={() => setMoodDuration(d.id as any)}
                        className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          moodDuration === d.id
                            ? 'bg-pink-500 text-white shadow-md'
                            : 'bg-white/5 border border-white/10 text-pink-200/70 hover:bg-white/10'
                        }`}
                      >
                        <span>{d.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
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

          {/* SECTION 6: VIP PAYMENT HISTORY */}
          {payments.length > 0 && (
            <div className="glass-romantic rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-400 fill-current" />
                <span>VIP Payment History</span>
              </h3>

              <div className="space-y-2 text-xs">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl bg-white/5 border border-pink-500/15 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-extrabold text-white">💎 Cupidx VIP Membership</p>
                      <p className="text-[10px] text-pink-200/60">
                        {new Date(p.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-yellow-400">₹{(p.amount / 100).toFixed(0)}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.status === 'CAPTURED' || p.status === 'SUCCESS'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : p.status === 'REFUNDED'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {p.status === 'CAPTURED' ? 'Paid' : p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
