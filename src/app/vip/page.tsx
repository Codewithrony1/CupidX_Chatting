'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
import SelfHostedVipModal from '@/components/payment/SelfHostedVipModal';
import {
  Crown,
  Sparkles,
  Check,
  X,
  ArrowLeft,
  Lock,
  Heart,
  Shield,
  Zap,
  UserCheck,
  Camera,
  MessageSquare,
  Loader2,
  CheckCircle2,
  AlertCircle,
  QrCode,
} from 'lucide-react';

export default function VIPPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  return (
    <AppShell>
      <div className="min-h-screen bg-[#0d0014] text-white pb-20 pt-4 px-4 max-w-xl mx-auto space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="p-2 rounded-2xl glass-card text-pink-300 hover:text-white transition-colors border border-pink-500/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center space-x-1.5">
            <Crown className="w-5 h-5 text-yellow-400 fill-current animate-bounce" />
            <span className="font-black text-sm tracking-wider uppercase text-yellow-400">CupidX VIP</span>
          </div>
          <div className="w-9" />
        </div>

        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pink-600/30 via-purple-600/20 to-pink-900/40 p-6 border border-pink-500/30 text-center space-y-4 shadow-2xl shadow-pink-500/10">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-yellow-400 to-amber-500 flex items-center justify-center mx-auto shadow-xl shadow-yellow-500/30">
            <Crown className="w-9 h-9 text-slate-950 fill-current" />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-white tracking-tight">Unlock CupidX VIP</h2>
            <p className="text-xs text-pink-200/70 max-w-xs mx-auto">
              Scan UPI QR code, pay via any UPI app & submit your UTR / screenshot for VIP activation.
            </p>
          </div>

          {/* Pricing Plans Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2 text-left">
            <div
              onClick={() => {
                setSelectedPlan('monthly');
                setShowModal(true);
              }}
              className="p-4 rounded-2xl bg-white/5 border-2 border-pink-500/40 hover:border-pink-500 cursor-pointer transition-all hover:scale-[1.02] relative group"
            >
              <span className="text-[10px] font-black uppercase text-pink-400 tracking-wider block">1 Month Pass</span>
              <div className="flex items-baseline space-x-1 my-1">
                <span className="text-2xl font-black text-white">₹29</span>
                <span className="text-[11px] text-slate-400">/ 30 days</span>
              </div>
              <p className="text-[10px] text-slate-300">Scan & submit UTR</p>
            </div>

            <div
              onClick={() => {
                setSelectedPlan('yearly');
                setShowModal(true);
              }}
              className="p-4 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-600/20 border-2 border-yellow-400/60 hover:border-yellow-400 cursor-pointer transition-all hover:scale-[1.02] relative group shadow-lg shadow-yellow-500/10"
            >
              <span className="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-[9px] font-black text-slate-950 uppercase tracking-wider">
                Best Value
              </span>
              <span className="text-[10px] font-black uppercase text-yellow-400 tracking-wider block">6 Months VIP</span>
              <div className="flex items-baseline space-x-1 my-1">
                <span className="text-2xl font-black text-white">₹199</span>
                <span className="text-[11px] text-slate-400">/ 180 days</span>
              </div>
              <p className="text-[10px] text-slate-300">Save over 60%</p>
            </div>
          </div>

          {/* Action Button */}
          {isVIP ? (
            <div className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-sm flex items-center justify-center space-x-2 shadow-xl shadow-emerald-500/30">
              <CheckCircle2 className="w-5 h-5" />
              <span>YOU ARE CURRENTLY A VIP MEMBER ✨</span>
            </div>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-300 hover:to-amber-400 text-slate-950 shadow-2xl shadow-yellow-500/40 text-sm flex items-center justify-center space-x-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              <QrCode className="w-5 h-5" />
              <span>UNLOCK VIP WITH UPI QR (₹29)</span>
            </button>
          )}
        </div>

        {/* Feature Comparison List */}
        <div className="glass-romantic rounded-3xl p-5 space-y-4 border border-pink-500/20">
          <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-pink-500/15 pb-3 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <span>What's Included in VIP</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0 border border-yellow-500/30">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <p className="font-extrabold text-white">Custom Profile DP & Avatars</p>
                <p className="text-pink-200/60 text-[11px]">Upload custom photos or choose premium avatar seeds.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0 border border-yellow-500/30">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="font-extrabold text-white">Smart Match & Gender Preferences</p>
                <p className="text-pink-200/60 text-[11px]">Match with preferred gender, moods, and personality tags.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0 border border-yellow-500/30">
                <Crown className="w-4 h-4 fill-current" />
              </div>
              <div>
                <p className="font-extrabold text-white">Golden VIP Profile Badge</p>
                <p className="text-pink-200/60 text-[11px]">Stand out with the 💎 VIP badge next to your username.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center shrink-0 border border-yellow-500/30">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="font-extrabold text-white">Priority Random Matchmaking Queue</p>
                <p className="text-pink-200/60 text-[11px]">Get matched faster at the front of the Random Chat queue.</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Self-Hosted QR Payment Modal */}
      <SelfHostedVipModal
        isOpen={showModal}
        defaultPlan={selectedPlan}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          refreshUser();
          router.replace('/dashboard');
        }}
      />
    </AppShell>
  );
}
