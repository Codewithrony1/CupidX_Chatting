'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
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
  Loader2
} from 'lucide-react';

export default function VIPPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [loadingPayment, setLoadingPayment] = useState(false);

  const isVIP = user?.subscription?.isActive || user?.membershipTier === 'VIP';

  const handleGetVIP = async () => {
    setLoadingPayment(true);
    try {
      // Create payment order
      const orderRes = await fetch('/api/payment/order', { method: 'POST' });
      const orderData = await orderRes.json();

      if (!orderRes.ok) {
        alert(orderData.error || 'Failed to create payment order');
        setLoadingPayment(false);
        return;
      }

      // Verify payment (Supports Mock or Razorpay)
      const verifyRes = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: orderData.orderId,
          razorpayPaymentId: `pay_${Date.now()}`,
          isMock: orderData.isMock ?? true,
        }),
      });

      const verifyData = await verifyRes.json();
      if (verifyRes.ok && verifyData.success) {
        await refreshUser();
        alert('🎉 Congratulations! You are now a CupidX VIP Member.');
        router.push('/profile');
      } else {
        alert(verifyData.error || 'Payment verification failed');
      }
    } catch (err) {
      console.error(err);
      alert('Error processing payment.');
    } finally {
      setLoadingPayment(false);
    }
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto w-full relative z-10">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between border-b border-pink-500/20 pb-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center space-x-2">
              <Crown className="w-5 h-5 text-yellow-400 fill-current" />
              <h1 className="text-xl font-black tracking-tight text-white">CUPIDX VIP</h1>
            </div>
          </div>

          {isVIP && (
            <span className="px-3 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[11px] font-extrabold uppercase tracking-wide">
              VIP ACTIVE
            </span>
          )}
        </div>

        {/* Hero Section */}
        <div className="glass-romantic rounded-3xl p-6 text-center space-y-3 relative overflow-hidden border border-yellow-500/30">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-yellow-400 via-amber-500 to-yellow-600 flex items-center justify-center mx-auto text-slate-950 shadow-xl shadow-yellow-500/30 animate-pulse">
            <Crown className="w-9 h-9 fill-current" />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-black text-white">CUPIDX VIP</h2>
            <p className="text-xs text-pink-200/80 max-w-sm mx-auto">
              Express yourself. Connect better. Customize your profile.
            </p>
          </div>
        </div>

        {/* Plan Comparison Grid */}
        <div className="space-y-4">
          
          {/* FREE Plan Card */}
          <div className="glass rounded-3xl p-6 space-y-4 border border-white/10 relative">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white">FREE</h3>
                <p className="text-xs text-pink-200/60 font-semibold">₹0 / month</p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400">
                Basic Plan
              </span>
            </div>

            <p className="text-xs text-slate-300 font-medium">Basic Cupidx experience</p>

            <ul className="space-y-2 text-xs text-slate-300">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Chat & 1-to-1 Ephemeral Dialogs</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Random Matchmaking</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Unique @username handle</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Basic Profile</span>
              </li>
              <li className="flex items-center gap-2 text-slate-400 opacity-75">
                <X className="w-4 h-4 text-rose-400/80 shrink-0" />
                <span className="line-through">Basic Mood (VIP Only)</span>
              </li>
              <li className="flex items-center gap-2 text-slate-400 opacity-75">
                <X className="w-4 h-4 text-rose-400/80 shrink-0" />
                <span className="line-through">Report & Block Features (VIP Only)</span>
              </li>
            </ul>
          </div>

          {/* 💎 VIP Plan Card */}
          <div className="glass-romantic rounded-3xl p-6 space-y-5 border-2 border-yellow-500/50 relative shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl -mr-6 -mt-6" />

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-yellow-400 fill-current" />
                  <h3 className="text-xl font-black text-white">💎 VIP</h3>
                </div>
                <p className="text-xs text-yellow-400 font-black">₹199 / month</p>
              </div>
              <span className="text-[11px] font-black px-3 py-1 rounded-full bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 shadow-md">
                PREMIUM
              </span>
            </div>

            <p className="text-xs text-pink-200/90 font-semibold">Premium Cupidx experience</p>

            <ul className="space-y-2.5 text-xs text-white">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Custom profile picture / DP upload & crop</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Advanced profile customization (Bio & Gender visibility)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Gender preferences (Men / Women / Anyone)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Personality preferences (Talkative, Funny, Friendly, etc.)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Talkative & preference-based matching priority</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Advanced moods & mood expiration timer</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>💎 VIP profile badge on profile, chat & search</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>VIP Personal User Bans</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-yellow-400 shrink-0" />
                <span>Enhanced discovery & controls</span>
              </li>
            </ul>

            {isVIP ? (
              <button
                disabled
                className="w-full py-3.5 rounded-2xl bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 font-black text-xs text-center cursor-default"
              >
                YOUR VIP MEMBERSHIP IS ACTIVE
              </button>
            ) : (
              <button
                onClick={handleGetVIP}
                disabled={loadingPayment}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 hover:from-yellow-300 hover:to-amber-400 text-slate-950 font-black text-sm shadow-xl shadow-yellow-500/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-2"
              >
                {loadingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Order...</span>
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4 fill-current" />
                    <span>GET VIP</span>
                  </>
                )}
              </button>
            )}
          </div>

        </div>

      </div>
    </AppShell>
  );
}
