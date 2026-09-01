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
  Copy,
  UploadCloud,
  ChevronRight,
  ExternalLink,
  Globe,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import confetti from 'canvas-confetti';

interface SelfHostedVipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultPlan?: 'monthly' | 'yearly';
}

export default function SelfHostedVipModal({
  isOpen,
  onClose,
  onSuccess,
  defaultPlan = 'monthly',
}: SelfHostedVipModalProps) {
  const { user, refreshUser } = useAuth();

  // Steps: 'REGION_SELECT' | 'QR_VIEW' | 'FORM_VIEW' | 'STATUS_VIEW'
  const [step, setStep] = useState<'REGION_SELECT' | 'QR_VIEW' | 'FORM_VIEW' | 'STATUS_VIEW'>('REGION_SELECT');
  const [selectedRegion, setSelectedRegion] = useState<'india' | 'international'>('india');
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>(defaultPlan);

  // Dynamic QR & Pricing configs from server
  const [paymentQrUrlIndia, setPaymentQrUrlIndia] = useState<string>('/uploads/qr/payment-qr-india.jpg');
  const [paymentQrUrlInternational, setPaymentQrUrlInternational] = useState<string>('/lexino-qr.jpg');
  const [merchantUpiId, setMerchantUpiId] = useState<string>('lexino@razorpay');
  const [merchantName, setMerchantName] = useState<string>('Lexino Enterprises');
  const [pricing, setPricing] = useState({
    india: { currency: 'INR', symbol: '₹', monthly: 29, yearly: 199 },
    international: { currency: 'USD', symbol: '$', monthly: 2, yearly: 12 },
  });

  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);

  // Form inputs
  const [paymentId, setPaymentId] = useState<string>('');
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Active status record
  const [existingRequest, setExistingRequest] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const activePricing = selectedRegion === 'india' ? pricing.india : pricing.international;
  const activeAmount = selectedPlan === 'yearly' ? activePricing.yearly : activePricing.monthly;
  const activeQrUrl = selectedRegion === 'india' ? paymentQrUrlIndia : paymentQrUrlInternational;

  // Load QR settings and existing user payment status on mount / open
  const loadData = async () => {
    try {
      // 1. Fetch QR Image & Pricing Info
      const qrRes = await fetch('/api/payment/qr');
      if (qrRes.ok) {
        const qrData = await qrRes.json();
        if (qrData.paymentQrUrlIndia) setPaymentQrUrlIndia(qrData.paymentQrUrlIndia);
        if (qrData.paymentQrUrlInternational) setPaymentQrUrlInternational(qrData.paymentQrUrlInternational);
        if (qrData.merchantUpiId) setMerchantUpiId(qrData.merchantUpiId);
        if (qrData.merchantName) setMerchantName(qrData.merchantName);
        if (qrData.pricing) setPricing(qrData.pricing);
      }

      // 2. Fetch User's existing request status
      const statusRes = await fetch('/api/payment/my-status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.request) {
          setExistingRequest(statusData.request);
          if (statusData.request.status === 'pending') {
            setStep('STATUS_VIEW');
          }
        }
      }
    } catch (e) {
      console.error('Error loading payment data:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
  }, [isOpen]);

  // Poll status while modal is open and request is pending
  useEffect(() => {
    if (!isOpen || step !== 'STATUS_VIEW') return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/payment/my-status');
        if (res.ok) {
          const data = await res.json();
          if (data.request) {
            setExistingRequest(data.request);

            if (data.request.status === 'approved') {
              try {
                confetti({
                  particleCount: 120,
                  spread: 80,
                  origin: { y: 0.6 },
                });
              } catch (e) {}

              await refreshUser();
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setTimeout(() => {
                onSuccess?.();
                onClose();
              }, 2500);
            }
          }
        }
      } catch (err) {
        console.warn('Status poll error:', err);
      }
    }, 5000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, step]);

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(merchantUpiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image size exceeds 5MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImagePreview(result);
      setScreenshotData(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanPaymentId = paymentId.trim();
    if (!cleanPaymentId && !screenshotData) {
      setErrorMsg('Please enter a Payment / Transaction ID or upload a screenshot.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/payment/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          region: selectedRegion,
          paymentId: cleanPaymentId,
          screenshot: screenshotData,
        }),
      });

      const data = await res.json();
      if (res.ok && data.request) {
        setExistingRequest(data.request);
        setStep('STATUS_VIEW');
      } else {
        setErrorMsg(data.error || 'Failed to submit payment proof.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-md bg-[#0e0117] text-white rounded-3xl border border-pink-500/30 shadow-2xl shadow-pink-500/20 overflow-hidden relative max-h-[92vh] flex flex-col"
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-gradient-to-b from-pink-600/30 via-purple-600/20 to-transparent blur-2xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between relative z-10 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-pink-500 to-violet-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                <span>Unlock CupidX VIP</span>
                <Sparkles className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              </h3>
              <p className="text-[10px] text-pink-300/80 font-medium">
                {step === 'REGION_SELECT' ? 'Select your payment region' : 'Scan QR & Submit Payment Proof'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 text-center relative z-10 overflow-y-auto">
          {/* STEP 1: REGION SELECTION */}
          {step === 'REGION_SELECT' && (
            <div className="space-y-4 py-2">
              <h4 className="text-sm font-black text-white">Choose Your Payment Method</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Select your payment region to view the appropriate QR code and local currency pricing.
              </p>

              <div className="space-y-3 pt-2">
                {/* Indian Payment Option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRegion('india');
                    setStep('QR_VIEW');
                  }}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-pink-500/5 hover:from-pink-500/20 hover:to-purple-500/20 border-2 border-pink-500/40 hover:border-pink-500 text-left transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🇮🇳</span>
                    <div>
                      <h5 className="text-xs font-black text-white group-hover:text-pink-300 transition-colors">
                        Indian Payment (UPI / QR)
                      </h5>
                      <p className="text-[11px] text-slate-400">GPay, PhonePe, Paytm, BHIM UPI</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-pink-400">₹{pricing.india.monthly}</span>
                    <span className="text-[10px] text-slate-400 block">/ 30 days</span>
                  </div>
                </button>

                {/* International Payment Option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRegion('international');
                    setStep('QR_VIEW');
                  }}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/5 hover:from-blue-500/20 hover:to-indigo-500/20 border-2 border-blue-500/40 hover:border-blue-500 text-left transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">🌍</span>
                    <div>
                      <h5 className="text-xs font-black text-white group-hover:text-blue-300 transition-colors">
                        International Payment
                      </h5>
                      <p className="text-[11px] text-slate-400">PayPal, Wise, Global QR & Cards</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-blue-400">${pricing.international.monthly}</span>
                    <span className="text-[10px] text-slate-400 block">/ 30 days</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: SCAN QR VIEW */}
          {step === 'QR_VIEW' && (
            <div className="space-y-4">
              {/* Region Switch Header */}
              <div className="flex items-center justify-between px-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-xs font-extrabold text-white">
                  {selectedRegion === 'india' ? '🇮🇳 India (UPI)' : '🌍 International'}
                </span>
                <button
                  type="button"
                  onClick={() => setStep('REGION_SELECT')}
                  className="text-xs font-bold text-pink-400 hover:text-pink-300 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Change Region</span>
                </button>
              </div>

              {/* Plan Selection Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPlan('monthly')}
                  className={`p-3 rounded-2xl border text-left transition-all relative cursor-pointer ${
                    selectedPlan === 'monthly'
                      ? 'bg-gradient-to-br from-pink-500/20 to-purple-600/20 border-pink-500 shadow-lg shadow-pink-500/20 text-white'
                      : 'bg-white/5 border-white/10 hover:border-white/20 text-slate-400'
                  }`}
                >
                  <span className="text-[11px] font-black block text-slate-300">1 Month VIP</span>
                  <div className="flex items-baseline space-x-1 mt-0.5">
                    <span className="text-lg font-black text-pink-400">
                      {activePricing.symbol}{activePricing.monthly}
                    </span>
                    <span className="text-[10px] text-slate-400">/ 30 days</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan('yearly')}
                  className={`p-3 rounded-2xl border text-left transition-all relative cursor-pointer ${
                    selectedPlan === 'yearly'
                      ? 'bg-gradient-to-br from-pink-500/20 to-purple-600/20 border-yellow-400 shadow-lg shadow-yellow-500/20 text-white'
                      : 'bg-white/5 border-white/10 hover:border-white/20 text-slate-400'
                  }`}
                >
                  <span className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-yellow-400 text-[8px] font-black text-slate-950 uppercase tracking-wider">
                    Best Value
                  </span>
                  <span className="text-[11px] font-black block text-slate-300">6 Months VIP</span>
                  <div className="flex items-baseline space-x-1 mt-0.5">
                    <span className="text-lg font-black text-yellow-400">
                      {activePricing.symbol}{activePricing.yearly}
                    </span>
                    <span className="text-[10px] text-slate-400">/ 180 days</span>
                  </div>
                </button>
              </div>

              {/* QR Image Box */}
              <div className="relative w-56 h-64 mx-auto bg-white p-2.5 rounded-2xl shadow-xl shadow-pink-500/20 border-2 border-pink-500/30 flex items-center justify-center">
                <img
                  src={activeQrUrl}
                  alt={`${selectedRegion} Payment QR Code`}
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>

              {/* Amount & Merchant Text */}
              <div className="space-y-1">
                <div className="flex items-center justify-center space-x-1.5 text-xs text-slate-300 font-bold uppercase tracking-wider">
                  <span>SCAN & PAY</span>
                  <span className="text-pink-400 font-black text-base">
                    {activePricing.symbol}{activeAmount.toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {selectedRegion === 'india'
                    ? 'Pay via Google Pay, PhonePe, Paytm, or BHIM'
                    : 'Scan QR with any supported payment app'}
                </p>
              </div>

              {/* Copyable UPI ID for Indian payments */}
              {selectedRegion === 'india' && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-mono text-[11px] truncate">{merchantUpiId}</span>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="px-2.5 py-1 rounded-lg bg-pink-500/20 text-pink-300 hover:bg-pink-500/30 text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedUpi ? 'Copied!' : 'Copy UPI'}</span>
                  </button>
                </div>
              )}

              {/* Primary Action Button: "I've Paid" */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setStep('FORM_VIEW')}
                className="w-full py-4 rounded-2xl font-black bg-gradient-to-r from-pink-600 via-pink-700 to-violet-700 hover:from-pink-500 hover:to-violet-600 text-white shadow-xl shadow-pink-500/30 text-sm flex items-center justify-center space-x-2 transition-all cursor-pointer"
              >
                <span>I've Paid</span>
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          )}

          {/* STEP 3: SUBMISSION FORM */}
          {step === 'FORM_VIEW' && (
            <motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={handleSubmitProof}
              className="space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <h4 className="text-xs font-black uppercase text-pink-400 tracking-wider">
                    Submit Payment Proof
                  </h4>
                  <span className="text-[10px] text-slate-400">
                    Region: {selectedRegion === 'india' ? '🇮🇳 India' : '🌍 International'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('QR_VIEW')}
                  className="text-xs font-bold text-slate-400 hover:text-white"
                >
                  Back to QR
                </button>
              </div>

              {/* Payment / Transaction ID Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  Payment / Transaction / UTR ID
                </label>
                <input
                  type="text"
                  placeholder={selectedRegion === 'india' ? 'e.g. 423984920192' : 'e.g. TXN-998273615'}
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-3 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-pink-500/40 uppercase tracking-wider"
                />
              </div>

              {/* Screenshot Upload */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  Payment Screenshot <span className="text-slate-400 font-normal">(Max 5MB)</span>
                </label>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 hover:border-pink-500 bg-white/5 hover:bg-pink-500/10 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-2"
                >
                  {imagePreview ? (
                    <div className="relative w-full h-28 rounded-xl overflow-hidden border border-white/15">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                        Attached ✓
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="w-9 h-9 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-200">Click to upload screenshot</p>
                        <p className="text-[10px] text-slate-400">JPG, PNG up to 5MB</p>
                      </div>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-2xl font-black bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white shadow-xl shadow-pink-500/30 text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Submit for Admin Approval</span>
                  </>
                )}
              </button>
            </motion.form>
          )}

          {/* STEP 4: PERSISTENT STATUS CARD */}
          {step === 'STATUS_VIEW' && existingRequest && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 text-center py-2"
            >
              {/* PENDING APPROVAL */}
              {existingRequest.status === 'pending' && (
                <div className="space-y-4">
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30 shadow-lg shadow-amber-500/20"
                  >
                    <Clock className="w-8 h-8" />
                  </motion.div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-extrabold text-[11px] border border-amber-500/30">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        PENDING APPROVAL
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-bold">
                        {existingRequest.region === 'india' ? '🇮🇳 India' : '🌍 International'}
                      </span>
                    </div>

                    <h3 className="text-base font-black text-white pt-2">
                      Payment Submitted
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                      Your VIP upgrade request is queued for manual admin verification.
                    </p>
                  </div>

                  {/* Submitted Details Box */}
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-left space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Plan</span>
                      <span className="font-bold text-pink-300 capitalize">
                        {existingRequest.plan} VIP ({existingRequest.currency === 'USD' ? '$' : '₹'}{existingRequest.amount})
                      </span>
                    </div>

                    {existingRequest.paymentId && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Payment / Transaction ID</span>
                        <span className="font-mono font-bold text-yellow-300">{existingRequest.paymentId}</span>
                      </div>
                    )}

                    {existingRequest.screenshotUrl && (
                      <div className="pt-1">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Uploaded Screenshot</span>
                        <div
                          onClick={() => setSelectedFullImage(existingRequest.screenshotUrl)}
                          className="relative w-full h-20 rounded-xl overflow-hidden border border-white/15 cursor-pointer group"
                        >
                          <img src={existingRequest.screenshotUrl} alt="Receipt" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] font-bold text-white bg-black/70 px-2 py-1 rounded flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" /> View Full
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400">
                    ⏱ Usually reviewed within 24 hours. VIP access will automatically unlock once approved.
                  </p>
                </div>
              )}

              {/* APPROVED */}
              {existingRequest.status === 'approved' && (
                <div className="space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-500 shadow-xl shadow-emerald-500/30"
                  >
                    <CheckCircle2 className="w-8 h-8" />
                  </motion.div>

                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-[11px] border border-emerald-500/30">
                      ✓ VIP APPROVED
                    </span>
                    <h3 className="text-lg font-black text-white pt-2">VIP Access Unlocked! 🎉</h3>
                    <p className="text-xs text-emerald-300">Your VIP membership is now active.</p>
                  </div>
                </div>
              )}

              {/* REJECTED */}
              {existingRequest.status === 'rejected' && (
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
                    <AlertCircle className="w-7 h-7" />
                  </div>

                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-extrabold text-[11px] border border-rose-500/30">
                      ✕ REQUEST REJECTED
                    </span>
                    <h3 className="text-base font-black text-white pt-2">Verification Failed</h3>
                    <p className="text-xs text-rose-400 font-bold max-w-xs mx-auto">
                      Reason: {existingRequest.rejectionReason || 'Invalid proof or payment not received.'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setStep('FORM_VIEW');
                      setExistingRequest(null);
                    }}
                    className="w-full py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Submit New Proof
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* Secure Guarantee Footer */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-center space-x-1.5 text-[10px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Manual Admin Review & VIP Activation</span>
          </div>
        </div>
      </motion.div>

      {/* Full Image Modal */}
      {selectedFullImage && (
        <div
          onClick={() => setSelectedFullImage(null)}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <img src={selectedFullImage} alt="Receipt Full" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
