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
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

type PaymentState = 'IDLE' | 'CREATING_ORDER' | 'RAZORPAY_OPEN' | 'VERIFYING_PAYMENT' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export default function VIPPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const [paymentState, setPaymentState] = useState<PaymentState>('IDLE');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const isVIP = user?.membershipTier === 'VIP' || (user?.subscription?.isActive === true && user?.subscription?.plan === 'VIP');

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleGetVIP = async () => {
    setPaymentState('CREATING_ORDER');
    setStatusMessage('');

    try {
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        setPaymentState('FAILED');
        setStatusMessage('Failed to load Razorpay SDK. Please check your internet connection.');
        return;
      }

      // Step 1: Create Order via Server Endpoint
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const orderData = await orderRes.json();

      if (!orderRes.ok || (!orderData.orderId && !orderData.order_id)) {
        if (orderData.isAlreadyVIP) {
          await refreshUser();
          router.replace('/dashboard');
          return;
        }
        setPaymentState('FAILED');
        setStatusMessage(orderData.error || 'Failed to create payment order');
        return;
      }

      const orderId = orderData.order_id || orderData.orderId;
      const keyId = orderData.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TNfnCTokMe0Xh0';

      setPaymentState('RAZORPAY_OPEN');

      // Step 2: Open Razorpay Standard Checkout Modal
      const options = {
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'CupidX VIP',
        description: '1 Month VIP Membership Subscription',
        order_id: orderId,
        handler: async function (response: any) {
          try {
            setPaymentState('VERIFYING_PAYMENT');
            setStatusMessage('Verifying payment signature with server...');

            // Step 3: Verify Payment Signature & Activation via Server Endpoint
            const verifyRes = await fetch('/api/payments/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setPaymentState('SUCCESS');
              setStatusMessage('💎 VIP ACTIVATED! Welcome to Cupidx VIP.');

              // Refresh Auth Context state & Redirect to Home immediately
              await refreshUser();
              setTimeout(() => {
                router.replace('/dashboard');
                router.refresh();
              }, 1200);
            } else {
              setPaymentState('FAILED');
              setStatusMessage(verifyData.error || 'Payment signature verification failed.');
            }
          } catch (err) {
            console.error('Verification error:', err);
            setPaymentState('FAILED');
            setStatusMessage('Error verifying payment signature.');
          }
        },
        modal: {
          ondismiss: function () {
            setPaymentState('CANCELLED');
            setStatusMessage('Payment cancelled.');
          },
        },
        prefill: {
          name: user?.fullName || user?.username || 'CupidX User',
          email: `${user?.username || 'user'}@cupidx.com`,
        },
        theme: {
          color: '#e11d48',
        },
      };

      const razorpayInstance = new (window as any).Razorpay(options);

      razorpayInstance.on('payment.failed', function (response: any) {
        console.error('Razorpay Payment Failed:', response.error);
        const desc = response.error?.description || response.error?.reason || '';
        setPaymentState('FAILED');
        if (desc.toLowerCase().includes('international')) {
          setStatusMessage('💳 International cards disabled. Please select UPI, Netbanking, or an Indian Debit/Credit Card.');
        } else {
          setStatusMessage(`Payment could not be completed. ${desc}`);
        }
      });

      razorpayInstance.open();
    } catch (err) {
      console.error('Checkout error:', err);
      setPaymentState('FAILED');
      setStatusMessage('Error initiating checkout process.');
    }
  };

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

        {/* Status Notification Alerts */}
        {paymentState === 'SUCCESS' && (
          <div className="p-4 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-bold text-center flex items-center justify-center space-x-2 animate-in fade-in duration-300 shadow-xl shadow-emerald-500/20">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {paymentState === 'CANCELLED' && (
          <div className="p-4 rounded-3xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold text-center flex items-center justify-center space-x-2 animate-in fade-in duration-300">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {paymentState === 'FAILED' && (
          <div className="p-4 rounded-3xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-sm font-bold text-center flex items-center justify-center space-x-2 animate-in fade-in duration-300">
            <X className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Hero Card */}
        <div className="glass-romantic rounded-3xl p-6 text-center space-y-4 border border-yellow-500/30 relative overflow-hidden bg-gradient-to-b from-yellow-950/30 via-pink-950/20 to-slate-950">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl" />
          
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-yellow-500 via-amber-500 to-yellow-600 flex items-center justify-center mx-auto shadow-xl shadow-yellow-500/30 border border-yellow-300/40">
            <Crown className="w-9 h-9 text-slate-950 fill-current" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-black text-white tracking-tight">
              Unlock <span className="text-yellow-400">CupidX VIP</span>
            </h1>
            <p className="text-xs text-pink-200/70 max-w-xs mx-auto">
              Unlock custom profile DP, gender preferences, personality matching & VIP badges for less than ₹1/day.
            </p>
          </div>

          {/* Pricing Box */}
          <div className="p-4 rounded-2xl bg-white/5 border border-yellow-500/20 max-w-xs mx-auto space-y-1">
            <div className="flex items-baseline justify-center space-x-1.5">
              <span className="text-3xl font-black text-yellow-400">₹29</span>
              <span className="text-xs text-pink-200/70 font-semibold">/ month</span>
            </div>
            <p className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider">
              ✨ 85% OFF SPECIAL LAUNCH OFFER
            </p>
          </div>

          {/* Subscribe CTA Button */}
          {isVIP ? (
            <div className="w-full py-4 rounded-2xl font-black bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm flex items-center justify-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>💎 VIP MEMBERSHIP ACTIVE</span>
            </div>
          ) : (
            <button
              onClick={handleGetVIP}
              disabled={paymentState === 'CREATING_ORDER' || paymentState === 'RAZORPAY_OPEN' || paymentState === 'VERIFYING_PAYMENT'}
              className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:to-amber-500 text-slate-950 shadow-xl shadow-yellow-500/30 transition-all text-sm flex items-center justify-center space-x-2 cursor-pointer active:scale-95 disabled:opacity-50 border border-yellow-300/50"
            >
              {paymentState === 'CREATING_ORDER' && (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-950" /> Creating Order...
                </span>
              )}
              {paymentState === 'RAZORPAY_OPEN' && (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-950" /> Opening Checkout...
                </span>
              )}
              {paymentState === 'VERIFYING_PAYMENT' && (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-950" /> Verifying Signature...
                </span>
              )}
              {paymentState === 'SUCCESS' && (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-slate-950" /> VIP Activated!
                </span>
              )}
              {(paymentState === 'IDLE' || paymentState === 'FAILED' || paymentState === 'CANCELLED') && (
                <span className="flex items-center gap-2">
                  <Crown className="w-5 h-5 fill-current" />
                  <span>SUBSCRIBE TO VIP FOR ₹29</span>
                </span>
              )}
            </button>
          )}
        </div>

        {/* Feature Comparison List */}
        <div className="glass-romantic rounded-3xl p-5 space-y-4 border border-pink-500/20">
          <h3 className="text-sm font-black text-white uppercase tracking-wider border-b border-pink-500/15 pb-3">
            💎 What's Included in VIP
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
                <p className="font-extrabold text-white">Target Gender & Match Preferences</p>
                <p className="text-pink-200/60 text-[11px]">Choose whether to match with Women, Men, or Anyone in Random Chat.</p>
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
    </AppShell>
  );
}
