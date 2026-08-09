'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Sparkles, X, CreditCard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
          const verifyRes = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpayOrderId: orderData.orderId,
              isMock: true,
            }),
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok) {
            setPaymentSuccess(true);
            await refreshUser();
          } else {
            alert('Mock payment verification failed');
          }
          setPaymentLoading(false);
        }, 1000);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'CupidX VIP',
        description: 'VIP Membership Subscription',
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayOrderId: orderData.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                isMock: false,
              }),
            });
            if (verifyRes.ok) {
              setPaymentSuccess(true);
              await refreshUser();
            } else {
              alert('Signature verification failed');
            }
          } catch (e) {
            console.error(e);
          } finally {
            setPaymentLoading(false);
          }
        },
        prefill: {
          name: user?.fullName,
          email: `${user?.username}@cupidx.com`,
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
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="https://checkout.razorpay.com/v1/checkout.js" />

      <Sidebar onOpenVIPModal={() => setShowVIPModal(true)} />

      <div className="flex-grow flex flex-col h-full overflow-y-auto relative">
        {children}
      </div>

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

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white">Upgrade to VIP</h3>
                  <p className="text-slate-400 text-sm">Unlock the ultimate dating & chat experience on CupidX</p>
                </div>

                <div className="py-4 px-6 rounded-2xl bg-white/5 border border-white/5 text-left space-y-3">
                  <div className="flex items-center space-x-3 text-sm text-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span>👑 Premium golden profile badge</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm text-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span>💬 Unlimited direct chats by username</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm text-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span>🎨 Advanced profile customizing & themes</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm text-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span>⚡ Priority system support</span>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
                  <div className="text-left">
                    <span className="text-xs text-yellow-500 font-semibold block uppercase">CupidX VIP Yearly</span>
                    <span className="text-slate-400 text-xs">Full membership benefits</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-yellow-400">₹29</span>
                  </div>
                </div>

                <button
                  onClick={handlePurchaseVIP}
                  disabled={paymentLoading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-yellow-500/25 transition-all flex items-center justify-center space-x-2 active:scale-98 cursor-pointer disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{paymentLoading ? 'Processing Payment...' : 'Unlock VIP Now'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/30 text-green-500">
                  <Sparkles className="w-8 h-8 fill-green-500/20" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white">Payment Successful!</h3>
                  <p className="text-slate-400 text-sm">Your account has been upgraded to VIP Member.</p>
                </div>

                <div className="p-4 rounded-2xl bg-green-500/5 border border-green-500/10 text-xs text-green-400">
                  A golden badge is now visible on your profile and messaging views. Thanks for subscribing!
                </div>

                <button
                  onClick={() => {
                    setShowVIPModal(false);
                    setPaymentSuccess(false);
                  }}
                  className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-sm transition-all cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
