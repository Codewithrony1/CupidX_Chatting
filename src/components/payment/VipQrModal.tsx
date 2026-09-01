'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Sparkles,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  Clock,
  Zap,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { VIP_PLANS } from '@/lib/config';
import confetti from 'canvas-confetti';

interface VipQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultPlan?: string;
}

export default function VipQrModal({
  isOpen,
  onClose,
  onSuccess,
  defaultPlan = 'VIP_MONTHLY',
}: VipQrModalProps) {
  const { user, refreshUser } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<string>(defaultPlan);
  const [orderId, setOrderId] = useState<string>('');
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [amount, setAmount] = useState<number>(29);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Status: "PENDING" | "PAID" | "EXPIRED"
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'PAID' | 'EXPIRED'>('PENDING');
  const [timeLeft, setTimeLeft] = useState<number>(600); // 10 minutes in seconds

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize or generate new dynamic QR order
  const generateOrder = async (planKey = selectedPlan) => {
    try {
      setLoading(true);
      setError('');
      setPaymentStatus('PENDING');
      setTimeLeft(600);

      const res = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      });

      const data = await res.json();
      if (!res.ok || !data.orderId) {
        if (data.isAlreadyVIP) {
          await refreshUser();
          onClose();
          return;
        }
        setError(data.error || 'Failed to generate dynamic payment QR');
        return;
      }

      setOrderId(data.orderId);
      setQrImageUrl(data.qrImageUrl);
      setAmount(data.amount);
    } catch (err: any) {
      console.error('Error generating order:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger order creation when modal opens or plan changes
  useEffect(() => {
    if (isOpen) {
      generateOrder(selectedPlan);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  }, [isOpen, selectedPlan]);

  // 10-Minute Countdown Timer
  useEffect(() => {
    if (!isOpen || paymentStatus !== 'PENDING') return;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          setPaymentStatus('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen, paymentStatus]);

  // Poll status endpoint every 3 seconds
  useEffect(() => {
    if (!isOpen || !orderId || paymentStatus !== 'PENDING') return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status/${orderId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'paid' || data.isPaid) {
          setPaymentStatus('PAID');
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

          // Trigger Confetti & Refresh State
          try {
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.6 },
            });
          } catch (e) {}

          await refreshUser();

          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 2000);
        }
      } catch (err) {
        console.warn('Status poll warning:', err);
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, orderId, paymentStatus]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-md bg-[#0e0117] text-white rounded-3xl border border-pink-500/30 shadow-2xl shadow-pink-500/20 overflow-hidden relative"
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-gradient-to-b from-pink-600/30 via-purple-600/20 to-transparent blur-2xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-500 to-violet-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                <span>Unlock CupidX VIP</span>
                <Sparkles className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              </h3>
              <p className="text-[10px] text-pink-300/80 font-medium">Instant dynamic UPI QR payment</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 text-center relative z-10">
          {/* Plan Selector Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {Object.values(VIP_PLANS).map((plan) => (
              <button
                key={plan.code}
                type="button"
                onClick={() => setSelectedPlan(plan.code)}
                className={`p-3 rounded-2xl border text-left transition-all relative ${
                  selectedPlan === plan.code
                    ? 'bg-gradient-to-br from-pink-500/20 to-purple-600/20 border-pink-500 shadow-lg shadow-pink-500/20 text-white'
                    : 'bg-white/5 border-white/10 hover:border-white/20 text-slate-400'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-2 right-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 text-[9px] font-black text-white uppercase tracking-wider">
                    {plan.badge}
                  </span>
                )}
                <span className="text-[11px] font-black block text-slate-300">{plan.name}</span>
                <div className="flex items-baseline space-x-1 mt-0.5">
                  <span className="text-lg font-black text-pink-400">₹{plan.priceInr}</span>
                  <span className="text-[10px] text-slate-400">/ {plan.durationDays}d</span>
                </div>
              </button>
            ))}
          </div>

          {/* QR Display or State */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
              <p className="text-xs font-bold text-slate-400">Generating dynamic UPI QR code...</p>
            </div>
          ) : error ? (
            <div className="py-10 space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs text-rose-400 font-bold px-4">{error}</p>
              <button
                onClick={() => generateOrder(selectedPlan)}
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          ) : paymentStatus === 'EXPIRED' ? (
            <div className="py-10 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">QR Code Expired</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                This dynamic UPI payment code has expired for security. Click below to generate a fresh QR code.
              </p>
              <button
                onClick={() => generateOrder(selectedPlan)}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-pink-600 to-violet-600 text-white text-xs font-black shadow-lg shadow-pink-500/30 transition-all inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Generate New QR Code</span>
              </button>
            </div>
          ) : paymentStatus === 'PAID' ? (
            <div className="py-8 space-y-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-500 shadow-xl shadow-emerald-500/30"
              >
                <CheckCircle2 className="w-8 h-8" />
              </motion.div>
              <h4 className="text-lg font-black text-white">Payment Confirmed! 🎉</h4>
              <p className="text-xs text-emerald-300 font-medium">VIP membership activated on your account.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Dynamic QR Container */}
              <div className="relative w-56 h-56 mx-auto bg-white p-3 rounded-2xl shadow-xl shadow-pink-500/20 border-2 border-pink-500/30 flex items-center justify-center">
                {qrImageUrl ? (
                  <img
                    src={qrImageUrl}
                    alt="Razorpay Dynamic UPI QR"
                    className="w-full h-full object-contain rounded-xl"
                  />
                ) : (
                  <QrCode className="w-32 h-32 text-slate-400 animate-pulse" />
                )}

                {/* Subtle Breathing Glow */}
                <div className="absolute inset-0 rounded-2xl border-2 border-pink-500/40 animate-ping pointer-events-none opacity-20" />
              </div>

              {/* Amount & Scan Text */}
              <div className="space-y-1">
                <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-300 font-bold uppercase tracking-wider">
                  <span>SCAN & PAY</span>
                  <span className="text-pink-400 font-black text-base">₹{amount.toFixed(2)}</span>
                </div>
                <p className="text-[11px] text-slate-400">Google Pay • PhonePe • Paytm • BHIM UPI • Cred</p>
              </div>

              {/* Live Status & Countdown Indicator */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="flex items-center space-x-2 text-pink-300 font-bold">
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
                  <span>Waiting for payment...</span>
                </div>

                <div className="flex items-center space-x-1 text-slate-400 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Expires: {formatTime(timeLeft)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Secure Guarantee Footer */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-center space-x-1.5 text-[10px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure 256-bit encrypted dynamic UPI payment • Instant auto-activation</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
