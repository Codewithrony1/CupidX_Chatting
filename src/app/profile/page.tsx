'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
import {
  User,
  Settings,
  Shield,
  Crown,
  LogOut,
  ChevronRight,
  Sparkles,
  Camera,
  Check,
  Loader2,
  Lock,
  Trash2
} from 'lucide-react';

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=romeo',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=juliet',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=cupid',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=angel',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=star',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=heart',
];

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();

  const isVIP = user?.subscription?.isActive || false;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);

  const handleAvatarClick = () => {
    if (!isVIP) {
      alert('🔒 Custom Profile Picture Upload is an exclusive VIP feature! Upgrade to VIP to set a custom profile photo.');
      return;
    }
    setShowPhotoPicker((prev) => !prev);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isVIP) {
      alert('🔒 Custom Profile Picture Upload is an exclusive VIP feature!');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      await saveAvatar(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const saveAvatar = async (avatarDataUrl: string) => {
    if (!isVIP) {
      alert('🔒 Custom Profile Picture Upload is an exclusive VIP feature!');
      return;
    }

    setUploading(true);
    setUploadSuccess(false);

    try {
      const isBase64 = avatarDataUrl.startsWith('data:image/');
      const payload = isBase64
        ? { avatarData: avatarDataUrl }
        : { avatarUrl: avatarDataUrl };

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await refreshUser();
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2500);
      } else {
        alert('Failed to update profile picture.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating profile photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (
      confirm(
        'CRITICAL: Are you sure you want to permanently delete your Cupidx account? All active chats, messages, and profile data will be permanently erased.'
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
      <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto w-full">
        
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Profile Card & Avatar Section */}
        <div className="glass-romantic rounded-3xl p-6 text-center space-y-4 relative overflow-hidden border border-pink-500/30">
          <div className="relative inline-block group">
            <img
              src={user?.profile?.avatarUrl || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${user?.username || 'me'}`}
              alt={user?.username || 'User'}
              className="w-24 h-24 rounded-full border-3 border-pink-400 object-cover mx-auto shadow-xl shadow-pink-500/30 transition-transform group-hover:scale-105"
            />
            
            {/* Camera / Lock Overlay Badge */}
            <button
              type="button"
              onClick={handleAvatarClick}
              className={`absolute bottom-0 right-0 p-2 rounded-full text-white shadow-lg border-2 border-slate-950 active:scale-95 transition-all cursor-pointer ${
                isVIP ? 'bg-pink-600 hover:bg-pink-500' : 'bg-slate-800/90 border-yellow-500/50 hover:bg-slate-700'
              }`}
              title={isVIP ? 'Change Profile Picture' : 'Profile Picture (VIP Feature)'}
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : uploadSuccess ? (
                <Check className="w-4 h-4 text-emerald-300" />
              ) : !isVIP ? (
                <Lock className="w-4 h-4 text-yellow-400" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>

            {isVIP && (
              <div className="absolute top-0 right-0 w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 to-amber-500 flex items-center justify-center text-slate-950 shadow-md">
                <Crown className="w-4 h-4 fill-current" />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-black text-white">@{user?.username}</h2>
            <p className="text-xs text-pink-200/70">{user?.fullName}</p>
          </div>

          {/* VIP-only Profile Picture Picker Drawer */}
          {showPhotoPicker && isVIP && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-pink-500/30 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-200">Select Profile Picture (VIP)</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/40 text-pink-300 text-[11px] font-bold border border-pink-500/30 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload Device Photo</span>
                </button>
              </div>

              {/* Avatar Presets Grid */}
              <div className="grid grid-cols-6 gap-2 pt-1">
                {AVATAR_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      saveAvatar(preset);
                      setShowPhotoPicker(false);
                    }}
                    className="p-1 rounded-full bg-white/5 border border-white/10 hover:border-pink-400 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                  >
                    <img src={preset} alt={`Avatar ${idx}`} className="w-9 h-9 rounded-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-pink-500/15 border border-pink-400/30 text-pink-300 text-[11px] font-bold">
            <Sparkles className="w-3 h-3 text-pink-400" />
            <span>{user?.profile?.bio || 'Hey there! I am using Cupidx.'}</span>
          </div>
        </div>

        {/* Quick Settings Links */}
        <div className="glass-romantic rounded-3xl p-4 space-y-2 border border-pink-500/20">
          <Link
            href="/settings"
            className="p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between transition-colors group cursor-pointer"
          >
            <div className="flex items-center space-x-3 text-xs font-bold text-white">
              <div className="w-8 h-8 rounded-xl bg-pink-500/20 flex items-center justify-center text-pink-400">
                <Settings className="w-4 h-4" />
              </div>
              <span>Account & Preference Settings</span>
            </div>
            <ChevronRight className="w-4 h-4 text-pink-300 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/privacy"
            className="p-3 rounded-2xl hover:bg-white/5 flex items-center justify-between transition-colors group cursor-pointer"
          >
            <div className="flex items-center space-x-3 text-xs font-bold text-white">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                <Shield className="w-4 h-4" />
              </div>
              <span>Privacy Policy</span>
            </div>
            <ChevronRight className="w-4 h-4 text-pink-300 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Account Action Buttons (Logout & Delete Account) */}
        <div className="space-y-3">
          <button
            onClick={logout}
            className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-pink-200 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out of Cupidx</span>
          </button>

          <button
            onClick={handleDeleteAccount}
            className="w-full py-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Account Permanently</span>
          </button>
        </div>
      </div>
    </AppShell>
  );
}
