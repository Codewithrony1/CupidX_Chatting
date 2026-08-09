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

interface BlockedUser {
  id: string;
  blockedId: string;
  blockedUser: {
    username: string;
    fullName: string;
    avatarUrl?: string;
  };
}

import AppShell from '@/components/AppShell';

export default function SettingsPage() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.fullName || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [theme, setTheme] = useState(user?.profile?.themePreference || 'system');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  // Fetch blocked users list
  const fetchBlockedUsers = async () => {
    try {
      const res = await fetch('/api/chat/block');
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(data.blockedUsers || []);
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
      fetchBlockedUsers();
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
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs"
                placeholder="Write a brief bio..."
              />
            </div>
          </div>

          {/* Section 2: Appearance / Theme Toggle */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sun className="w-4 h-4 text-yellow-400" />
              Appearance & Theme
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
                <Sun className="w-5 h-5 text-yellow-400" />
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
