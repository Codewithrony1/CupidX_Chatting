'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
import { Search, Sparkles, Heart, Crown, ArrowRight, UserCheck, Shield, MessageSquare, Zap, Lock } from 'lucide-react';

interface SearchUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isOnline: boolean;
}

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  const [preferredGender, setPreferredGender] = useState(user?.profile?.preferredGender || 'auto');
  const [language, setLanguage] = useState(user?.profile?.language || 'english');
  const [savingPrefs, setSavingPrefs] = useState(false);

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

  const handleStartDirectChat = async (targetUsername: string) => {
    try {
      const res = await fetch('/api/chat/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUsername }),
      });

      const data = await res.json();

      if (res.status === 409 && data.activeSessionId) {
        // Active chat limit error
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
        {/* User Mobile Greeting */}
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-pink-300 text-xs font-extrabold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Welcome back</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Hi, @{user?.username || 'friend'} 👋
          </h1>
          <p className="text-xs text-pink-200/70">Ready to connect and chat?</p>
        </div>

        {/* Main CTA: Random Chat Matchmaking */}
        <div className="glass-romantic rounded-3xl p-6 space-y-4 border border-pink-500/30 text-center relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-pink-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center mx-auto shadow-lg shadow-pink-500/30">
            <Heart className="w-6 h-6 text-white fill-white animate-bounce" />
          </div>

          <div>
            <h2 className="text-xl font-black text-white">Instant Random Chat</h2>
            <p className="text-xs text-pink-200/70 mt-1 max-w-xs mx-auto">
              Match instantly with random users. Press NEXT at any time to delete the conversation and move to another connection.
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

        {/* Matching Preferences Section */}
        <div className="glass-romantic rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Target Match Preferences
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] text-pink-200/70 font-semibold">Target Partner Gender</label>
                {!user?.subscription?.isActive && (
                  <span className="text-[10px] text-yellow-400 font-extrabold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> VIP Feature
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['auto', 'female', 'male', 'nonbinary'].map((g) => {
                  const isVIP = user?.subscription?.isActive || false;
                  const isLocked = g !== 'auto' && !isVIP;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        if (isLocked) {
                          alert('🔒 Gender targeting (Female / Male / Non-Binary) is an exclusive VIP feature! Upgrade to VIP to select target gender.');
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
                      <span>{g === 'auto' ? 'Auto ⚡' : g}</span>
                      {isLocked && <Lock className="w-3 h-3 text-yellow-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] text-pink-200/70 block mb-1.5 font-semibold">Chat Language</label>
              <select
                value={language}
                onChange={(e) => handleSavePreferences(preferredGender, e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs"
              >
                <option value="english">English</option>
                <option value="hindi">Hindi / Hinglish</option>
                <option value="french">French</option>
                <option value="spanish">Spanish</option>
                <option value="any">Any Language</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
