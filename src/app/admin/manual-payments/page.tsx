'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Search,
  ExternalLink,
  Loader2,
  AlertCircle,
  User,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

export default function AdminManualPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'ALL' | 'UNDER_REVIEW' | 'PAID' | 'REJECTED'>('UNDER_REVIEW');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Reject modal state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/manual-payments');
      const data = await res.json();
      if (res.ok && data.payments) {
        setPayments(data.payments);
      }
    } catch (e) {
      console.error('Failed to fetch admin payments:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleAction = async (id: string, action: 'APPROVE' | 'REJECT', rejectionReason?: string) => {
    try {
      setProcessingId(id);
      const res = await fetch('/api/admin/manual-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, rejectionReason }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await fetchPayments();
        setRejectingId(null);
        setRejectReason('');
      } else {
        alert(data.error || 'Action failed');
      }
    } catch (e) {
      console.error(e);
      alert('Error updating payment');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (filter !== 'ALL' && p.status !== filter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchUtr = p.utrNumber?.toLowerCase().includes(term);
      const matchUser = p.user?.username?.toLowerCase().includes(term) || p.user?.displayName?.toLowerCase().includes(term);
      const matchId = p.paymentId?.toLowerCase().includes(term);
      return matchUtr || matchUser || matchId;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0A1128] text-white p-4 sm:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Admin Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-blue-400" />
                <span>Lexino Manual UPI Payments Admin</span>
              </h1>
              <p className="text-xs text-slate-400">Review & verify UTR submissions for Lexino Enterprises</p>
            </div>
          </div>

          <button
            onClick={fetchPayments}
            className="px-4 py-2 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 font-bold text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <span>Refresh List</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(['UNDER_REVIEW', 'PAID', 'REJECTED', 'ALL'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filter === tab
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/10'
                }`}
              >
                {tab === 'UNDER_REVIEW' && '⏳ Under Review'}
                {tab === 'PAID' && '✓ Approved'}
                {tab === 'REJECTED' && '✕ Rejected'}
                {tab === 'ALL' && 'All Payments'}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search UTR, User or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Payments List */}
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-bold">Loading payment verification requests...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center bg-white/5 rounded-3xl border border-white/10 space-y-2">
            <Clock className="w-10 h-10 text-slate-500 mx-auto" />
            <h3 className="text-base font-bold text-white">No payments found</h3>
            <p className="text-xs text-slate-400">No requests match the selected status or search filter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPayments.map((payment) => (
              <motion.div
                key={payment.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                        <span>{payment.user?.displayName || payment.user?.fullName || 'User'}</span>
                        <span className="text-xs text-slate-400 font-mono font-normal">(@{payment.user?.username})</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">Order ID: <span className="font-mono text-slate-300 font-bold">{payment.paymentId}</span></p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-3">
                    <span className="text-lg font-black text-emerald-400">₹{payment.amount.toFixed(2)}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      payment.status === 'UNDER_REVIEW'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                        : payment.status === 'PAID'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {payment.status}
                    </span>
                  </div>
                </div>

                {/* UTR & Screenshot Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-2 bg-white/5 p-3.5 rounded-xl border border-white/5">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Submitted UTR / UPI Ref</span>
                      <span className="font-mono font-black text-sm text-yellow-300 tracking-wider">
                        {payment.utrNumber || 'No UTR Submitted'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Plan</span>
                      <span className="font-bold text-white">{payment.planName}</span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Submitted At</span>
                      <span className="text-slate-300">{new Date(payment.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Screenshot Thumbnail */}
                  <div className="bg-white/5 p-3.5 rounded-xl border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Receipt Screenshot</span>
                    {payment.screenshotUrl ? (
                      <div
                        onClick={() => setSelectedImage(payment.screenshotUrl)}
                        className="relative w-full h-24 rounded-lg overflow-hidden border border-white/10 cursor-pointer group"
                      >
                        <img src={payment.screenshotUrl} alt="Receipt" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] font-bold text-white bg-black/60 px-2 py-1 rounded flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View Full
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-slate-500 text-xs italic">No screenshot uploaded</div>
                    )}
                  </div>
                </div>

                {/* Admin Actions for Under Review */}
                {payment.status === 'UNDER_REVIEW' && (
                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      disabled={processingId === payment.id}
                      onClick={() => {
                        setRejectingId(payment.id);
                        setRejectReason('Invalid UTR number or payment not received.');
                      }}
                      className="px-4 py-2 rounded-xl bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Reject Payment
                    </button>

                    <button
                      disabled={processingId === payment.id}
                      onClick={() => handleAction(payment.id, 'APPROVE')}
                      className="px-5 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-black shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
                    >
                      {processingId === payment.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approve & Unlock VIP</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

              </motion.div>
            ))}
          </div>
        )}

      </div>

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 text-left">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-500" />
              <span>Reject Payment Verification</span>
            </h3>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-bold">Rejection Reason</label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Invalid UTR or payment not received"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setRejectingId(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(rejectingId, 'REJECT', rejectReason)}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <img src={selectedImage} alt="Receipt Full" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
        </div>
      )}
    </div>
  );
}
