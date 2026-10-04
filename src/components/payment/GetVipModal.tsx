'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Sparkles,
  Phone,
  Send,
  Copy,
  Check,
  CheckCircle2,
  X,
  RefreshCw,
  Video,
  Mic,
  ShieldCheck,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import confetti from 'canvas-confetti';

interface GetVipModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
}

export default function GetVipModal({ isOpen, onClose, reason }: GetVipModalProps) {
  const { user, refreshUser } = useAuth();
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Contact details loaded from environment variables with safe defaults
  const upiId = process.env.NEXT_PUBLIC_ADMIN_UPI_ID || 'sumitpornsware@fam';
  const whatsappNumber = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '+919876543210';
  const telegramUsername = (process.env.NEXT_PUBLIC_ADMIN_TELEGRAM || '@cupidxadmin').replace(/^@/, '');

  const cleanWhatsApp = whatsappNumber.replace(/[^0-9]/g, '');
  const username = user?.username || 'user';
  const whatsappUrl = `https://wa.me/${cleanWhatsApp}?text=${encodeURIComponent(
    `Hi Admin, I want to activate VIP on CupidX for my username: @${username}`
  )}`;
  const telegramUrl = `https://t.me/${telegramUsername}`;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    setStatusMessage(null);
    try {
      await refreshUser();
      const res = await fetch('/api/auth/me');
      const data = await res.json().catch(() => ({}));

      if (data?.user?.is_vip || data?.user?.membershipTier === 'VIP') {
        try {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        } catch {}
        setStatusMessage('🎉 Your VIP status is active! Enjoy full access.');
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setStatusMessage('Your payment is under review. Please ensure you sent the screenshot to Admin on WhatsApp or Telegram.');
      }
    } catch {
      setStatusMessage('Could not verify status right now. Please refresh the page shortly.');
    } finally {
      setCheckingStatus(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-[#12081c] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden"
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 right-1/4 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-40 h-40 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/20 mb-2">
              <Crown className="w-7 h-7 fill-current" />
            </div>
            <h3 className="text-2xl font-black text-white tracking-wide">
              Unlock Cupid<span className="text-amber-400">X</span> VIP
            </h3>
            <p className="text-xs text-slate-300">
              {reason || 'Voice and Video calls are exclusive to VIP members.'}
            </p>
          </div>

          {/* VIP Perks */}
          <div className="grid grid-cols-2 gap-2.5 mb-6 text-xs">
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <Video className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Unlimited Video Calls</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <Mic className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Crystal Clear Voice Calls</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <Zap className="w-4 h-4 text-pink-400 shrink-0" />
              <span>Priority Matchmaking</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5 text-slate-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>VIP Crown Badge</span>
            </div>
          </div>

          {/* How to Get VIP — 3 Steps */}
          <div className="bg-slate-950/60 border border-amber-500/20 rounded-2xl p-4 space-y-3 mb-6">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Simple 3-Step VIP Activation
            </h4>

            {/* Step 1: Pay UPI */}
            <div className="flex items-start gap-2.5 text-xs text-slate-300">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] shrink-0 mt-0.5">
                1
              </span>
              <div className="flex-1">
                <span>Send payment to Admin UPI ID:</span>
                <div className="mt-1 flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900 border border-slate-700 font-mono text-xs text-amber-200">
                  <span className="truncate">{upiId}</span>
                  <button
                    onClick={handleCopyUpi}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-sans font-bold text-[11px] transition-colors"
                  >
                    {copiedUpi ? (
                      <>
                        <Check className="w-3 h-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Send Screenshot */}
            <div className="flex items-start gap-2.5 text-xs text-slate-300">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] shrink-0 mt-0.5">
                2
              </span>
              <p>
                Send payment screenshot with your username (
                <strong className="text-white font-mono">@{username}</strong>) to Admin:
              </p>
            </div>

            {/* Action Buttons: WhatsApp & Telegram */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-[1.02]"
              >
                <Phone className="w-4 h-4 fill-current" />
                <span>WhatsApp</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>

              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-[1.02]"
              >
                <Send className="w-4 h-4" />
                <span>Telegram</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            </div>

            {/* Step 3: Fast Activation */}
            <div className="flex items-start gap-2.5 text-xs text-slate-300 pt-1">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] shrink-0 mt-0.5">
                3
              </span>
              <p className="text-slate-400">
                Admin verifies your transfer and immediately grants VIP status to your account.
              </p>
            </div>
          </div>

          {/* Status Message if any */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold mb-4 ${
                statusMessage.includes('🎉')
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
              }`}
            >
              {statusMessage}
            </div>
          )}

          {/* Verify / Refresh Button */}
          <button
            onClick={handleCheckStatus}
            disabled={checkingStatus}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} />
            <span>{checkingStatus ? 'Checking VIP Status...' : 'I Sent Payment — Check VIP Status'}</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
