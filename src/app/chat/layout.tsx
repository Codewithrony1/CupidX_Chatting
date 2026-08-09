'use client';

import React, { useState } from 'react';
import Script from 'next/script';
import AppShell from '@/components/AppShell';
import { Sparkles, X, CreditCard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [showVIPModal, setShowVIPModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const handlePurchaseVIP = async () => {
    setPaymentLoading(true);
    try {
      const orderRes = await fetch('/api/payment/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error);

      if (orderData.isMock) {
        setTimeout(async () => {
          await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ razorpay_payment_id: 'mock_pay_123', isMock: true }),
          });
          await refreshUser();
          setPaymentLoading(false);
          setPaymentSuccess(true);
        }, 1500);
        return;
      }

      const options = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'CupidX VIP',
        description: 'Monthly VIP Membership',
        order_id: orderData.orderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            if (verifyRes.ok) {
              await refreshUser();
              setPaymentSuccess(true);
            }
          } catch (e) {
            console.error(e);
          } finally {
            setPaymentLoading(false);
          }
        },
        theme: {
          color: '#8b5cf6',
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (error: any) {
      alert(error.message || 'Payment initiation failed');
      setPaymentLoading(false);
    }
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {children}

      {showVIPModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md glass-premium rounded-3xl p-8 space-y-6 relative overflow-hidden border border-yellow-500/20">
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />

            <button
              onClick={() => {
                setShowVIPModal(false);
                setPaymentSuccess(false);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {!paymentSuccess ? (
              <div className="space-y-6 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/30 text-yellow-500 animate-pulse">
                  <Sparkles className="w-8 h-8 fill-yellow-500/20" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white">Upgrade to CupidX VIP</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Unlock exclusive features: unlimited direct messages, gender preference filtering, and VIP badge!
                  </p>
                </div>

                <div className="glass p-4 rounded-2xl border border-yellow-500/20 text-left space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span>VIP Plan (1 Month)</span>
                    <span className="text-yellow-400 font-bold">₹199</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Cancel anytime. Instant activation.</p>
                </div>

                <button
                  onClick={handlePurchaseVIP}
                  disabled={paymentLoading}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-yellow-500/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{paymentLoading ? 'Processing...' : 'Pay ₹199 with Razorpay'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6 text-center py-4">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 text-emerald-400">
                  <Sparkles className="w-8 h-8 fill-emerald-500/20" />
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white">Welcome to VIP!</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Your membership is now active. Enjoy all premium CupidX features!
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowVIPModal(false);
                    setPaymentSuccess(false);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
