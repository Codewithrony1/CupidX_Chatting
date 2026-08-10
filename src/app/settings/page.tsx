'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  User,
  Shield,
  Moon,
  Sun,
  Laptop,
  Trash2,
  LogOut,
  ArrowLeft,
  Check,
  Ban,
  Lock,
  Sparkles,
  Heart
} from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';
import AppShell from '@/components/AppShell';

interface BlockedUser {
  id: string;
  blockedId: string;
  blockedUser: {
    username: string;
    fullName: string;
    avatarUrl?: string;
  };
}

interface BannedUserItem {
  id: string;
  bannedUserId: string;
  bannedUser: {
    id: string;
    username: string;
    fullName: string;
    profile?: {
      avatarUrl?: string;
    };
  };
}

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  const [displayName, setDisplayName] = useState(user?.fullName || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [theme, setTheme] = useState(user?.profile?.themePreference || 'system');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUserItem[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  // Fetch blocked & personal banned users list
  const fetchPrivacyLists = async () => {
    try {
      const [blockRes, banRes] = await Promise.all([
        fetch('/api/chat/block'),
        fetch('/api/chat/ban'),
      ]);

      if (blockRes.ok) {
        const data = await blockRes.json();
        setBlockedUsers(data.blockedUsers || []);
      }

      if (banRes.ok) {
        const data = await banRes.json();
        setBannedUsers(data.bans || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBlocks(false);
    }
  };

  useEffect(() => {
    if (user) {
      setDisplayName(user.fullName || '');
      setBio(user.profile?.bio || '');
      setTheme(user.profile?.themePreference || 'system');
      fetchPrivacyLists();
    }
  }, [user]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio,
          themePreference: theme,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        await refreshUser();
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async (blockedId: string) => {
    try {
      const res = await fetch('/api/chat/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: blockedId, action: 'unblock' }),
      });
      if (res.ok) {
        setBlockedUsers((prev) => prev.filter((b) => b.blockedId !== blockedId));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnban = async (targetUserId: string) => {
    if (!isVIP) {
      alert('🔒 Unbanning users is an exclusive VIP feature! Active VIP membership is required to manage personal bans.');
      return;
    }

    try {
      const res = await fetch('/api/chat/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, action: 'unban' }),
      });
      if (res.ok) {
        setBannedUsers((prev) => prev.filter((b) => b.bannedUserId !== targetUserId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to unban user.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAccount = async () => {
    if (
      confirm(
        'CRITICAL: Are you sure you want to permanently delete your Cupidx account? All active chats, messages, and profile data will be erased.'
      )
    ) {
      try {
        const res = await fetch('/api/auth/delete-account', { method: 'DELETE' });
        if (res.ok) {
          alert('Your account has been deleted.');
          router.push('/login');
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto w-full relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pink-500/20 pb-5">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">Settings</h1>
              <p className="text-xs text-pink-200/70">Manage your profile, theme, and account privacy</p>
            </div>
          </div>
        </div>

        {/* Form Grid */}
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Section 1: Profile Settings */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-pink-400" />
              Profile Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Username</label>
                <div className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 font-mono">
                  @{user?.username}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-pink-300 uppercase tracking-wider block">Bio</label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share something about yourself..."
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
              />
            </div>
          </div>

          {/* Section 2: Privacy (Blocked & Banned Users) */}
          <div className="glass-romantic rounded-3xl p-6 space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              Privacy & User Moderation
            </h3>

            {/* Blocked Users Sub-Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-extrabold text-pink-300 uppercase tracking-wider">Blocked Users (Free & Everyone)</h4>

              {loadingBlocks ? (
                <div className="text-xs text-pink-200/50">Loading list...</div>
              ) : blockedUsers.length === 0 ? (
                <div className="text-xs text-pink-200/60 italic p-3 rounded-2xl bg-white/5 border border-white/5">
                  You have not blocked any users.
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedUsers.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <img
                          src={item.blockedUser.avatarUrl || '/default-avatar.png'}
                          alt={item.blockedUser.username}
                          className="w-8 h-8 rounded-full object-cover bg-slate-800"
                        />
                        <div>
                          <p className="text-xs font-bold text-white">@{item.blockedUser.username}</p>
                          <p className="text-[10px] text-pink-200/60">{item.blockedUser.fullName}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnblock(item.blockedId)}
                        className="px-3 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/40 text-pink-300 text-xs font-bold border border-pink-500/30 transition-all cursor-pointer"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* VIP Personal Banned Users Sub-Section */}
            <div className="space-y-3 pt-2 border-t border-pink-500/15">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-yellow-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                  <span>Banned Users (VIP Personal Bans)</span>
                </h4>
                {!isVIP && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-extrabold border border-yellow-500/30 flex items-center gap-0.5">
                    <Lock className="w-3 h-3" /> VIP Feature
                  </span>
                )}
              </div>

              {loadingBlocks ? (
                <div className="text-xs text-pink-200/50">Loading list...</div>
              ) : bannedUsers.length === 0 ? (
                <div className="text-xs text-pink-200/60 italic p-3 rounded-2xl bg-white/5 border border-white/5">
                  You have not personally banned any users.
                </div>
              ) : (
                <div className="space-y-2">
                  {bannedUsers.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-white/5 border border-yellow-500/20 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <img
                          src={item.bannedUser.profile?.avatarUrl || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${item.bannedUser.username}`}
                          alt={item.bannedUser.username}
                          className="w-8 h-8 rounded-full object-cover bg-slate-800 border border-yellow-500/40"
                        />
                        <div>
                          <p className="text-xs font-bold text-white flex items-center gap-1">
                            <span>@{item.bannedUser.username}</span>
                            <Sparkles className="w-3 h-3 text-yellow-400 fill-current shrink-0" />
                          </p>
                          <p className="text-[10px] text-pink-200/60">{item.bannedUser.fullName}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUnban(item.bannedUserId)}
                        className="px-3 py-1.5 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-300 text-xs font-bold border border-yellow-500/30 transition-all cursor-pointer"
                      >
                        Unban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Appearance & Theme */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Moon className="w-4 h-4 text-purple-400" />
              Appearance Theme
            </h3>

            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`p-4 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-pink-500/20 border-pink-400 text-white shadow-lg shadow-pink-500/20'
                    : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                }`}
              >
                <Sun className="w-5 h-5 text-amber-400" />
                <span>Light</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-pink-500/20 border-pink-400 text-white shadow-lg shadow-pink-500/20'
                    : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                }`}
              >
                <Moon className="w-5 h-5 text-purple-400" />
                <span>Dark</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`p-4 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                  theme === 'system'
                    ? 'bg-pink-500/20 border-pink-400 text-white shadow-lg shadow-pink-500/20'
                    : 'bg-white/5 border-white/10 text-pink-200/70 hover:bg-white/10'
                }`}
              >
                <Laptop className="w-5 h-5 text-pink-400" />
                <span>System</span>
              </button>
            </div>
          </div>

          {saveSuccess && (
            <div className="p-3 rounded-2xl bg-green-500/15 border border-green-500/30 text-xs text-green-400 text-center font-bold flex items-center justify-center gap-1">
              <Check className="w-4 h-4" /> Settings saved successfully!
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-bold text-xs shadow-lg shadow-pink-500/30 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>

        {/* Section 4: Danger Zone (Logout & Delete Account) */}
        <div className="glass-romantic rounded-3xl p-6 space-y-4 border border-rose-500/30">
          <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Account Management
          </h3>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={logout}
              className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-pink-200 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>

            <button
              onClick={handleDeleteAccount}
              className="w-full py-3 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Account Permanently</span>
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
