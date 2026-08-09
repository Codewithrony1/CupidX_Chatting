'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
import BottomSheet from '@/components/ui/BottomSheet';
import {
  Search,
  Sparkles,
  Heart,
  Crown,
  ArrowRight,
  UserCheck,
  Shield,
  MessageSquare,
  Zap,
  Lock,
  Smile,
  User,
  Settings,
  X,
  Check
} from 'lucide-react';

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isOnline: boolean;
}

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

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const isVIP = user?.subscription?.isActive || user?.membershipTier === 'VIP';

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const [preferredGender, setPreferredGender] = useState(user?.profile?.preferredGender || 'auto');
  const [language, setLanguage] = useState(user?.profile?.language || 'english');
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Mood Bottom Sheet State
  const [showMoodSheet, setShowMoodSheet] = useState(false);
  const [currentMood, setCurrentMood] = useState(user?.profile?.mood || '😎 Attitude');
  const [savingMood, setSavingMood] = useState(false);

  // Search users by username
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.users || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectMood = async (selectedMood: string) => {
    setCurrentMood(selectedMood);
    setSavingMood(true);
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: selectedMood }),
      });
      await refreshUser();
      setShowMoodSheet(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingMood(false);
    }
  };

  const handleStartDirectChat = async (targetUsername: string) => {
    try {
      const res = await fetch('/api/chat/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername }),
      });

      const data = await res.json();

      if (res.status === 409 && data.activeSessionId) {
        alert(data.message);
        router.push(`/chat/random`);
        return;
      }

      if (res.ok && data.sessionId) {
        router.push(`/chat/random`);
      } else {
        alert(data.error || data.message || 'Unable to connect');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePreferences = async (newGender: string, newLang: string) => {
    setPreferredGender(newGender);
    setLanguage(newLang);
    setSavingPrefs(true);
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredGender: newGender, language: newLang }),
      });
      await refreshUser();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto w-full">
        
        {/* User Greeting & VIP Status Badge */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2 text-pink-300 text-xs font-extrabold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Good day</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Hi, @{user?.username || 'friend'} 👋
            </h1>
          </div>

          <Link
            href="/vip"
            className={`px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1 shadow-md border ${
              isVIP
                ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 border-yellow-400'
                : 'bg-white/5 text-yellow-400 border-yellow-500/40 hover:bg-white/10'
            }`}
          >
            <Crown className="w-3.5 h-3.5 fill-current" />
            <span>{isVIP ? '💎 VIP MEMBER' : '✨ Upgrade to VIP'}</span>
          </Link>
        </div>

        {/* 2. MEMBERSHIP CARD (Requirement 2) */}
        {!isVIP ? (
          <div className="glass rounded-3xl p-5 border border-pink-500/25 space-y-3 relative overflow-hidden bg-gradient-to-r from-pink-950/40 via-purple-950/40 to-slate-950/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-pink-400 fill-current" />
                <span className="text-xs font-black text-white uppercase tracking-wider">✨ CUPIDX FREE MEMBER</span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Unlock Cupidx VIP</h3>
              <p className="text-xs text-pink-200/70 mt-0.5">
                Customize your profile, discover better connections and express yourself more.
              </p>
            </div>
            <Link
              href="/vip"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-2xl bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 text-slate-950 font-black text-xs shadow-md hover:scale-102 transition-transform cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5 fill-current" />
              <span>GET VIP</span>
            </Link>
          </div>
        ) : (
          <div className="glass-romantic rounded-3xl p-5 border border-yellow-500/30 space-y-3 relative overflow-hidden bg-gradient-to-r from-yellow-950/40 via-amber-950/30 to-slate-950/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Crown className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="text-xs font-black text-yellow-300 uppercase tracking-wider">💎 CUPIDX VIP MEMBER</span>
              </div>
            </div>
            <p className="text-xs text-pink-100/90 font-medium">
              Your premium profile is active. Enjoy custom DP, personality matching & VIP bans.
            </p>
            <Link
              href="/vip"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-2xl bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/40 font-black text-xs transition-all cursor-pointer"
            >
              <span>MANAGE VIP</span>
            </Link>
          </div>
        )}

        {/* Quick Search & Random Chat */}
        <div className="space-y-3">
          {/* Live Username Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-pink-400" />
            <input
              type="text"
              placeholder="🔍 Search username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl glass-input text-xs text-white placeholder:text-pink-300/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
          </div>

          {/* Search Results Drawer */}
          {searchResults.length > 0 && (
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-pink-500/30 space-y-2 animate-in fade-in duration-200">
              <span className="text-[11px] font-bold text-pink-300 px-1">Matching Users</span>
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center space-x-2.5">
                    <img
                      src={u.avatarUrl || '/default-avatar.png'}
                      alt={u.username}
                      className="w-8 h-8 rounded-full object-cover bg-slate-800"
                    />
                    <div>
                      <p className="text-xs font-bold text-white">@{u.username}</p>
                      <p className="text-[10px] text-pink-200/60">{u.displayName}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleStartDirectChat(u.username)}
                    className="px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs shadow-sm cursor-pointer"
                  >
                    Chat
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Main CTA: Random Chat Matchmaking */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4 border border-pink-500/30 text-center relative overflow-hidden">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center mx-auto shadow-lg shadow-pink-500/30">
              <Heart className="w-6 h-6 text-white fill-white animate-bounce" />
            </div>

            <div>
              <h2 className="text-xl font-black text-white">✨ Instant Random Chat</h2>
              <p className="text-xs text-pink-200/70 mt-1 max-w-xs mx-auto">
                Match instantly with random users. Press NEXT at any time to delete the conversation.
              </p>
            </div>

            <Link
              href="/chat/random"
              className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white shadow-xl shadow-pink-500/40 hover:scale-102 active:scale-95 transition-all text-base flex items-center justify-center space-x-2 border border-pink-400/40 cursor-pointer block"
            >
              <span>START RANDOM CHAT ✨</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Current Mood Widget (Requirement 10 & 11) */}
        <div className="glass-romantic rounded-3xl p-5 space-y-3 border border-pink-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-pink-300 uppercase tracking-wider">Current Mood</span>
            <button
              onClick={() => setShowMoodSheet(true)}
              className="text-xs font-bold text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Smile className="w-3.5 h-3.5" />
              <span>Change</span>
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center space-x-3">
            <span className="text-2xl leading-none">{currentMood.split(' ')[0]}</span>
            <div>
              <p className="text-xs font-bold text-white">{currentMood}</p>
              <p className="text-[10px] text-pink-200/60">Visible on your profile & chat card</p>
            </div>
          </div>
        </div>

        {/* 9. VIP DISCOVERY & MATCHING PREFERENCES */}
        <div className="glass-romantic rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span>Target Match Preferences</span>
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-pink-200/70 font-semibold">Who would you like to connect with?</label>
                {!isVIP && (
                  <span className="text-[10px] text-yellow-400 font-extrabold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> VIP Feature
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['auto', 'female', 'male', 'any'].map((g) => {
                  const isLocked = g !== 'auto' && !isVIP;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          alert('🔒 Gender targeting is an exclusive VIP feature! Upgrade to VIP to select target gender preference.');
                          return;
                        }
                        handleSavePreferences(g, language);
                      }}
                      className={`py-2 px-1 rounded-xl text-[11px] font-bold capitalize transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        preferredGender === g
                          ? 'bg-pink-500 text-white shadow-md'
                          : isLocked
                          ? 'bg-white/5 text-pink-200/40 border border-white/5 hover:border-yellow-500/40'
                          : 'bg-white/5 text-pink-200/70 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {g === 'auto' ? 'Anyone' : g}
                      {isLocked && <Lock className="w-2.5 h-2.5 text-yellow-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* User Profile Personalization Summary */}
        <div className="glass-romantic rounded-3xl p-5 space-y-4 border border-pink-500/20">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-pink-400" />
              Your Profile Overview
            </h3>
            <Link
              href="/profile"
              className="text-xs font-bold text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Edit Profile</span>
            </Link>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center space-x-3">
              <img
                src={user?.profile?.avatarUrl || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${user?.username}`}
                alt={user?.username || 'User'}
                className="w-10 h-10 rounded-full object-cover bg-slate-800 border border-pink-400/50"
              />
              <div>
                <h4 className="text-sm font-bold text-white">@{user?.username}</h4>
                <p className="text-[11px] text-pink-200/70">{user?.fullName}</p>
              </div>
            </div>

            <p className="text-xs text-pink-200/80 italic p-2.5 rounded-xl bg-white/5">
              "{user?.profile?.bio || 'Hey there! I am using Cupidx.'}"
            </p>
          </div>
        </div>
      </div>

      {/* Mood Bottom Sheet (Requirement 11) */}
      <BottomSheet isOpen={showMoodSheet} onClose={() => setShowMoodSheet(false)} title="Select your mood">
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
            {MOOD_OPTIONS.map((m) => {
              const selected = currentMood === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelectMood(m)}
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
    </AppShell>
  );
}
