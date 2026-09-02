'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { VIP_AVATAR_CATEGORIES } from '@/lib/avatars';
import { formatDisplayDob, calculateAge, updateFirestoreUserProfile } from '@/lib/firestoreUser';
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
  Calendar,
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

export default function ProfilePage() {
  const { user, firebaseUser, refreshUser } = useAuth();
  const router = useRouter();

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  // Form States
  const [displayName, setDisplayName] = useState(user?.displayName || user?.fullName || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [showBio, setShowBio] = useState(user?.profile?.showBio ?? true);
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth || user?.profile?.dateOfBirth || '');
  const [gender, setGender] = useState<string>(user?.gender || user?.profile?.gender || 'male');
  const [showGender, setShowGender] = useState(user?.profile?.showGender ?? true);
  const [preferredGender, setPreferredGender] = useState(user?.profile?.preferredGender || 'auto');
  const [mood, setMood] = useState(user?.profile?.mood || '');
  const [showMood, setShowMood] = useState(user?.profile?.showMood ?? true);
  const [moodDuration, setMoodDuration] = useState<'1hour' | '24hours' | 'never'>('24hours');

  // Personality Tags
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
    if (user) {
      setDisplayName(user.displayName || user.fullName || '');
      setBio(user.profile?.bio || '');
      setShowBio(user.profile?.showBio ?? true);
      setDateOfBirth(user.dateOfBirth || user.profile?.dateOfBirth || '');
      setGender(user.gender || user.profile?.gender || 'male');
      setShowGender(user.profile?.showGender ?? true);
      setPreferredGender(user.profile?.preferredGender || 'auto');
      setMood(user.profile?.mood || '');
      setShowMood(user.profile?.showMood ?? true);
      setAvatarType(user.profile?.avatarType || 'EMOJI');
      setAvatarEmoji(user.profile?.avatarEmoji || '😊');
      setAvatarUrl(user.profile?.avatarUrl || null);

      const tags = user.profile?.personalityPreferences
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

    const uid = firebaseUser?.uid || user?.id;

    try {
      // 1. Save to Cloud Firestore
      if (uid) {
        const updates: any = {
          fullName: displayName.trim(),
          displayName: displayName.trim(),
          profile: {
            ...user?.profile,
            showBio,
            showGender,
            preferredGender,
            personalityPreferences: personalityTags.join(','),
            avatarType,
            avatarEmoji,
          },
        };

        if (isVIP) {
          updates.dateOfBirth = dateOfBirth;
          updates.gender = gender;
          updates.profile.bio = bio;
          updates.profile.dateOfBirth = dateOfBirth;
          updates.profile.gender = gender;
          updates.profile.age = calculateAge(dateOfBirth);
          updates.profile.mood = mood;
          updates.profile.showMood = showMood;
        }

        await updateFirestoreUserProfile(uid, updates);
      }

      // 2. Sync to Backend Database API
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          bio: isVIP ? bio : undefined,
          showBio,
          dob: isVIP ? dateOfBirth : undefined,
          dateOfBirth: isVIP ? dateOfBirth : undefined,
          gender: isVIP ? gender : undefined,
          showGender,
          preferredGender,
          personalityPreferences: personalityTags.join(','),
          mood: isVIP ? mood : undefined,
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

  const dynamicAge = calculateAge(dateOfBirth || user?.dateOfBirth || user?.profile?.dateOfBirth);

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
            
            {/* Avatar Render Box */}
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
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAvatarType('EMOJI')}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                        avatarType === 'EMOJI'
                          ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      ✨ VIP Emoji Avatars
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarType('IMAGE');
                        if (!imagePreview && !avatarUrl) {
                          fileInputRef.current?.click();
                        }
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                        avatarType === 'IMAGE'
                          ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-md'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
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
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Full / Display Name</label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/10 text-pink-300 font-bold border border-pink-500/20">
                    {`Name changes left today: ${Math.max(0, 4 - ((user?.profile as any)?.nameChangesCount ?? 0))}/4`}
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={50}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Rony Rai"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Unique @username</label>
                <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-mono text-xs">
                  @{user?.username}
                </div>
              </div>

              {/* Bio Field — Free (Locked) vs VIP (Editable) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Bio</label>
                  {!isVIP ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-300 font-bold border border-yellow-500/30 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-yellow-400" />
                      <span>VIP — Upgrade to edit</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30 flex items-center gap-1">
                      <Crown className="w-3 h-3 fill-current" />
                      <span>VIP Unlocked</span>
                    </span>
                  )}
                </div>

                <div className="relative">
                  <textarea
                    rows={3}
                    disabled={!isVIP}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={isVIP ? "Share a short intro about yourself..." : "Upgrade to VIP to write a custom bio."}
                    className={`w-full px-3.5 py-2.5 rounded-xl glass-input text-xs ${
                      !isVIP ? 'opacity-70 cursor-not-allowed bg-black/40' : ''
                    }`}
                  />
                  {!isVIP && (
                    <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded-xl flex items-center justify-center pointer-events-none">
                      <Link
                        href="/vip"
                        className="pointer-events-auto px-3 py-1.5 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 font-black text-[11px] shadow-lg flex items-center gap-1 hover:scale-105 transition-transform"
                      >
                        <Crown className="w-3.5 h-3.5 fill-current" />
                        <span>Unlock Bio Editing with VIP</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: IDENTITY, DATE OF BIRTH & GENDER */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <User className="w-4 h-4 text-purple-400" />
                <span>Identity, Date of Birth &amp; Gender</span>
              </h3>

              {isVIP ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-extrabold border border-yellow-500/30 flex items-center gap-1">
                  <Crown className="w-3 h-3 fill-current" /> Editable with VIP 💎
                </span>
              ) : (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-extrabold border bg-rose-500/15 text-rose-300 border-rose-500/30 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-rose-400" />
                  <span>Locked for Free members</span>
                </span>
              )}
            </div>

            {/* Date of Birth Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">
                  Date of Birth
                </label>
                <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Age: {dynamicAge} yrs
                </span>
              </div>

              {isVIP ? (
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold cursor-pointer"
                />
              ) : (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-white">
                      {formatDisplayDob(dateOfBirth || user?.dateOfBirth || user?.profile?.dateOfBirth)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-bold">
                    <Lock className="w-3 h-3 text-yellow-400" />
                    <span>Locked</span>
                  </span>
                </div>
              )}
              <p className="text-[10px] text-pink-200/50">
                {isVIP ? 'VIP members can update their date of birth anytime.' : 'Date of birth is permanently locked for Free members.'}
              </p>
            </div>

            {/* Gender Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">
                Gender
              </label>

              {isVIP ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Male', val: 'male' },
                    { label: 'Female', val: 'female' },
                    { label: 'Other', val: 'other' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setGender(item.val)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        gender === item.val
                          ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white border-pink-400 shadow-md'
                          : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-white capitalize">
                    {gender || user?.gender || user?.profile?.gender || 'Unspecified'}
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-bold">
                    <Lock className="w-3 h-3 text-yellow-400" />
                    <span>Locked</span>
                  </span>
                </div>
              )}
              <p className="text-[10px] text-pink-200/50">
                {isVIP ? 'VIP members can update their gender preferences.' : 'Gender is locked after initial setup. Upgrade to VIP to change.'}
              </p>
            </div>
          </div>

          {/* SECTION 3: PERSONALITY TAGS */}
          <div className="glass-romantic rounded-3xl p-6 space-y-3 text-left">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span>Personality Tags</span>
            </h3>
            <p className="text-xs text-pink-200/70">Pick tags that best describe your romantic personality:</p>

            <div className="flex flex-wrap gap-2 pt-1">
              {PERSONALITY_OPTIONS.map((tag) => {
                const isSelected = personalityTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => togglePersonalityTag(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-pink-600 text-white border-pink-400 shadow-md scale-105'
                        : 'bg-white/5 text-pink-200/70 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Success Banner */}
          {saveSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center animate-pulse">
              ✓ Profile saved successfully!
            </div>
          )}

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-pink-600 via-rose-500 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-black text-sm uppercase tracking-wider shadow-xl shadow-pink-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Check className="w-5 h-5" />
                <span>Save Profile</span>
              </>
            )}
          </button>
        </form>

        {/* VIP Lock Modal */}
        {showVipLockModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-3xl bg-[#120021] border border-yellow-500/30 p-6 space-y-4 shadow-2xl text-center">
              <div className="w-14 h-14 rounded-2xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 flex items-center justify-center mx-auto">
                <Crown className="w-8 h-8 fill-current" />
              </div>
              <h3 className="text-lg font-black text-white">CupidX VIP Feature</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Custom profile photos, unlimited DOB &amp; Gender editing, and bio customization require a CupidX VIP membership.
              </p>
              <div className="flex items-center space-x-2 pt-2">
                <Link
                  href="/vip"
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg hover:scale-105 transition-transform"
                >
                  Upgrade to VIP for ₹29
                </Link>
                <button
                  type="button"
                  onClick={() => setShowVipLockModal(false)}
                  className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
