'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Users,
  Crown,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  QrCode,
  Shield,
  Ban,
  Unlock,
  Copy,
  ExternalLink,
  UploadCloud,
  Check,
  AlertCircle,
  MessageSquare,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Settings,
  DollarSign,
  Radio,
  Send,
  Loader2,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface StatData {
  totalUsers: number;
  vipUsers: number;
  pendingRequests: number;
  approvedRequests?: number;
  activeChats: number;
  totalMessages?: number;
}

interface UserItem {
  id: string;
  clerkUserId?: string | null;
  username: string;
  fullName: string;
  displayName: string;
  email: string;
  plan: 'VIP' | 'FREE';
  is_vip: boolean;
  vip_expires_at?: string | null;
  isSuspended: boolean;
  role: string;
  gender: string;
  avatarUrl: string;
  createdAt: string;
}

interface PaymentRequestItem {
  id: string;
  requestId: string;
  userId: string;
  username: string;
  plan: string;
  region: 'india' | 'international';
  amount: number;
  currency: string;
  paymentId?: string | null;
  screenshotUrl?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  user?: {
    id: string;
    username: string;
    email?: string;
    fullName: string;
  };
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'USERS' | 'QR_SETTINGS' | 'BROADCAST'>('REQUESTS');

  // Stats
  const [stats, setStats] = useState<StatData>({
    totalUsers: 0,
    vipUsers: 0,
    pendingRequests: 0,
    activeChats: 0,
  });

  // Requests state
  const [requests, setRequests] = useState<PaymentRequestItem[]>([]);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [requestRegionFilter, setRequestRegionFilter] = useState<'all' | 'india' | 'international'>('all');
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);

  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userPlanFilter, setUserPlanFilter] = useState<'all' | 'vip' | 'free'>('all');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // QR Settings state
  const [qrSettings, setQrSettings] = useState({
    paymentQrUrlIndia: '/uploads/qr/payment-qr-india.jpg',
    paymentQrUrlInternational: '/lexino-qr.jpg',
    merchantUpiId: 'lexino@razorpay',
    indiaPriceMonthly: 29,
    indiaPriceYearly: 199,
    intlPriceMonthly: 2,
    intlPriceYearly: 12,
  });
  const [savingQr, setSavingQr] = useState(false);
  const [qrSuccessMsg, setQrSuccessMsg] = useState('');
  const [qrErrorMsg, setQrErrorMsg] = useState('');

  // Indian QR File Preview
  const [indiaQrPreview, setIndiaQrPreview] = useState<string | null>(null);
  const [intlQrPreview, setIntlQrPreview] = useState<string | null>(null);
  const indiaFileRef = useRef<HTMLInputElement>(null);
  const intlFileRef = useRef<HTMLInputElement>(null);

  // Broadcast
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState('');

  // 1-Click Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch Stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Payment Requests
  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      let url = `/api/admin/payment-requests?status=${requestStatusFilter}`;
      if (requestRegionFilter !== 'all') {
        url += `&region=${requestRegionFilter}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Fetch Users
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(userSearch)}&plan=${userPlanFilter}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch QR Settings
  const fetchQrSettings = async () => {
    try {
      const res = await fetch('/api/payment/qr');
      if (res.ok) {
        const data = await res.json();
        setQrSettings({
          paymentQrUrlIndia: data.paymentQrUrlIndia || '/uploads/qr/payment-qr-india.jpg',
          paymentQrUrlInternational: data.paymentQrUrlInternational || '/lexino-qr.jpg',
          merchantUpiId: data.merchantUpiId || 'lexino@razorpay',
          indiaPriceMonthly: data.pricing?.india?.monthly || 29,
          indiaPriceYearly: data.pricing?.india?.yearly || 199,
          intlPriceMonthly: data.pricing?.international?.monthly || 2,
          intlPriceYearly: data.pricing?.international?.yearly || 12,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchRequests();
    fetchUsers();
    fetchQrSettings();
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [requestStatusFilter, requestRegionFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, userPlanFilter]);

  // Approve Payment Request (Optimistic UI update)
  const handleApproveRequest = async (requestId: string) => {
    // Optimistically update request status in UI
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId || r.requestId === requestId ? { ...r, status: 'approved' } : r))
    );

    try {
      const res = await fetch(`/api/admin/payment-requests/${requestId}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchStats();
        fetchUsers();
        try {
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.5 } });
        } catch (e) {}
      } else {
        fetchRequests(); // Revert on failure
      }
    } catch (e) {
      console.error(e);
      fetchRequests();
    }
  };

  // Reject Payment Request
  const handleRejectRequest = async (requestId: string) => {
    const reason = rejectReason.trim() || 'Payment verification failed.';

    // Optimistically update UI
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId || r.requestId === requestId ? { ...r, status: 'rejected', rejectionReason: reason } : r))
    );
    setRejectingId(null);
    setRejectReason('');

    try {
      const res = await fetch(`/api/admin/payment-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        fetchStats();
      } else {
        fetchRequests();
      }
    } catch (e) {
      console.error(e);
      fetchRequests();
    }
  };

  // Grant / Revoke VIP
  const handlePlanAction = async (userId: string, action: 'grant' | 'revoke', days = 30) => {
    try {
      const res = await fetch('/api/admin/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, days }),
      });
      if (res.ok) {
        fetchUsers();
        fetchStats();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle User Ban
  const handleToggleBan = async (userId: string, currentSuspended: boolean) => {
    try {
      const res = await fetch('/api/admin/users/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isSuspended: !currentSuspended }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Handle QR Image file selection
  const handleQrFile = (e: React.ChangeEvent<HTMLInputElement>, region: 'india' | 'international') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (region === 'india') {
        setIndiaQrPreview(result);
      } else {
        setIntlQrPreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Save QR Settings
  const handleSaveQrSettings = async (region: 'india' | 'international') => {
    setSavingQr(true);
    setQrSuccessMsg('');
    setQrErrorMsg('');

    const qrImageData = region === 'india' ? indiaQrPreview : intlQrPreview;

    try {
      const res = await fetch('/api/admin/payment-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region,
          qrImageData,
          upiId: qrSettings.merchantUpiId,
          indiaPriceMonthly: qrSettings.indiaPriceMonthly,
          indiaPriceYearly: qrSettings.indiaPriceYearly,
          intlPriceMonthly: qrSettings.intlPriceMonthly,
          intlPriceYearly: qrSettings.intlPriceYearly,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setQrSuccessMsg(`${region === 'india' ? 'Indian' : 'International'} QR & settings saved successfully!`);
        fetchQrSettings();
      } else {
        setQrErrorMsg(data.error || 'Failed to update QR code.');
      }
    } catch (e) {
      console.error(e);
      setQrErrorMsg('Network error saving settings.');
    } finally {
      setSavingQr(false);
    }
  };

  // Send Broadcast
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;

    setSendingBroadcast(true);
    setBroadcastStatus('');

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: broadcastMessage }),
      });
      if (res.ok) {
        setBroadcastStatus('Broadcast notification sent to all active users!');
        setBroadcastMessage('');
      } else {
        setBroadcastStatus('Failed to send broadcast.');
      }
    } catch (e) {
      setBroadcastStatus('Error sending broadcast.');
    } finally {
      setSendingBroadcast(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07010e] text-slate-100 pb-20">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#0d0119]/90 backdrop-blur-xl border-b border-pink-500/20 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl shadow-pink-500/5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                <span>CupidX Admin Command Center</span>
                <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 text-[10px] font-black tracking-wider uppercase border border-pink-500/30">
                  PRO
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Manage VIP subscriptions, user status, payment verification & QR configurations
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard"
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold border border-white/10 transition-colors flex items-center gap-1.5"
          >
            <span>Live App</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => {
              fetchStats();
              fetchRequests();
              fetchUsers();
            }}
            className="p-2 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 transition-all cursor-pointer"
            title="Refresh All"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* STATS HEADER */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Users</p>
              <h3 className="text-2xl font-black text-white mt-0.5">{stats.totalUsers}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">VIP Members</p>
              <h3 className="text-2xl font-black text-yellow-400 mt-0.5 flex items-center gap-1">
                <span>{stats.vipUsers}</span>
                <Crown className="w-4 h-4 fill-current text-yellow-400" />
              </h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center justify-center">
              <Crown className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-gradient-to-br from-pink-950/40 via-purple-950/20 to-slate-900/60 border border-pink-500/30 backdrop-blur-md shadow-xl shadow-pink-500/5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-pink-300 uppercase tracking-wider">Pending Requests</p>
              <h3 className="text-2xl font-black text-pink-400 mt-0.5 flex items-center gap-1.5">
                <span>{stats.pendingRequests}</span>
                {stats.pendingRequests > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping" />
                )}
              </h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-pink-500/20 border border-pink-500/30 text-pink-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Live Chats</p>
              <h3 className="text-2xl font-black text-emerald-400 mt-0.5">{stats.activeChats}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('REQUESTS')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'REQUESTS'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Payment Requests</span>
            {stats.pendingRequests > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-yellow-400 text-slate-950 text-[10px] font-black">
                {stats.pendingRequests}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('USERS')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'USERS'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users & VIPs ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('QR_SETTINGS')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'QR_SETTINGS'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Payment QR & Pricing</span>
          </button>

          <button
            onClick={() => setActiveTab('BROADCAST')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'BROADCAST'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Broadcast Alerts</span>
          </button>
        </div>

        {/* TAB 1: PAYMENT REQUESTS QUEUE */}
        {activeTab === 'REQUESTS' && (
          <div className="space-y-4">
            {/* Filters Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900/80 border border-slate-800">
              {/* Status Filter */}
              <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-2xl border border-slate-800">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setRequestStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                      requestStatusFilter === s
                        ? 'bg-pink-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Region Filter */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-400">Region:</span>
                <select
                  value={requestRegionFilter}
                  onChange={(e) => setRequestRegionFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl bg-black/60 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                >
                  <option value="all">All Regions (India & Intl)</option>
                  <option value="india">🇮🇳 India Only</option>
                  <option value="international">🌍 International Only</option>
                </select>
              </div>
            </div>

            {/* Requests List */}
            {loadingRequests ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-pink-500 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-400">Loading payment requests...</p>
              </div>
            ) : requests.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">No payment requests found</h4>
                <p className="text-xs text-slate-400">All payment proofs in this filter have been processed.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className={`p-5 rounded-3xl border transition-all space-y-4 relative ${
                      req.status === 'pending'
                        ? 'bg-gradient-to-br from-slate-900/90 via-[#130122]/80 to-slate-900/90 border-pink-500/30 shadow-xl shadow-pink-500/5'
                        : req.status === 'approved'
                        ? 'bg-slate-900/60 border-emerald-500/30'
                        : 'bg-slate-900/40 border-slate-800'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 rounded-2xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-300 font-bold text-xs">
                          {req.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <h4 className="text-sm font-black text-white">@{req.username}</h4>
                            <span className="text-xs">
                              {req.region === 'india' ? '🇮🇳' : '🌍'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Submitted: {new Date(req.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          req.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : req.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>

                    {/* Plan, Amount & Payment ID */}
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/40 border border-white/5 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Plan</span>
                        <span className="font-extrabold text-pink-300 capitalize">{req.plan} VIP</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Amount</span>
                        <span className="font-extrabold text-white">
                          {req.currency === 'USD' ? '$' : '₹'}{req.amount}
                        </span>
                      </div>

                      {req.paymentId && (
                        <div className="col-span-2 pt-1 border-t border-white/5 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase">Transaction / UTR ID</span>
                            <span className="font-mono font-bold text-yellow-300 text-xs">{req.paymentId}</span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(req.paymentId!, req.id)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="Copy ID"
                          >
                            {copiedId === req.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Screenshot Preview */}
                    {req.screenshotUrl && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Payment Screenshot (Click to enlarge)
                        </span>
                        <div
                          onClick={() => setSelectedFullImage(req.screenshotUrl!)}
                          className="relative w-full h-32 rounded-2xl overflow-hidden border border-white/10 cursor-pointer group bg-black"
                        >
                          <img
                            src={req.screenshotUrl}
                            alt="Receipt"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="px-3 py-1.5 rounded-xl bg-black/80 text-white text-xs font-bold flex items-center gap-1.5">
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>View Full Size</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rejection Reason if Rejected */}
                    {req.status === 'rejected' && req.rejectionReason && (
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
                        <span className="font-bold">Rejection Reason:</span> {req.rejectionReason}
                      </div>
                    )}

                    {/* Actions: Approve / Reject (for pending) */}
                    {req.status === 'pending' && (
                      <div className="pt-2 border-t border-white/10 space-y-2">
                        {rejectingId === req.id ? (
                          <div className="space-y-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                            <input
                              type="text"
                              placeholder="Reason (e.g. Invalid UTR, amount not received)..."
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                            />
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleRejectRequest(req.id)}
                                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer"
                              >
                                Confirm Rejection
                              </button>
                              <button
                                onClick={() => setRejectingId(null)}
                                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold transition-all cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleApproveRequest(req.id)}
                              className="flex-1 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Approve & Grant VIP</span>
                            </button>

                            <button
                              onClick={() => {
                                setRejectingId(req.id);
                                setRejectReason('');
                              }}
                              className="px-4 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: USERS & VIP MANAGEMENT */}
        {activeTab === 'USERS' && (
          <div className="space-y-4">
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900/80 border border-slate-800">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by username, email, full name..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-black/40 border border-slate-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-400">Plan:</span>
                <select
                  value={userPlanFilter}
                  onChange={(e) => setUserPlanFilter(e.target.value as any)}
                  className="px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                >
                  <option value="all">All Plans</option>
                  <option value="vip">VIP Users Only</option>
                  <option value="free">Free Users Only</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="rounded-3xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-black/40 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">User</th>
                      <th className="px-5 py-3.5">Email</th>
                      <th className="px-5 py-3.5">Plan</th>
                      <th className="px-5 py-3.5">VIP Expiration</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadingUsers ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-pink-500" />
                          Loading users...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                          No users found matching search criteria.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                          {/* User Info */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-300 font-bold">
                                {u.username.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-extrabold text-white">@{u.username}</p>
                                <p className="text-[10px] text-slate-400">{u.fullName}</p>
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="px-5 py-3.5 text-slate-300 font-mono text-[11px]">
                            {u.email}
                          </td>

                          {/* Plan */}
                          <td className="px-5 py-3.5">
                            {u.is_vip ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 font-black text-[10px] border border-yellow-500/30">
                                <Crown className="w-3 h-3 fill-current" />
                                <span>VIP</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-bold text-[10px]">
                                FREE
                              </span>
                            )}
                          </td>

                          {/* VIP Expiry */}
                          <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">
                            {u.vip_expires_at
                              ? new Date(u.vip_expires_at).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </td>

                          {/* Banned / Active Status */}
                          <td className="px-5 py-3.5">
                            {u.isSuspended ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px] border border-rose-500/30">
                                Suspended
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                                Active
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3.5 text-right space-x-2">
                            {u.is_vip ? (
                              <button
                                onClick={() => handlePlanAction(u.id, 'revoke')}
                                className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/20 transition-all cursor-pointer"
                              >
                                Revoke VIP
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePlanAction(u.id, 'grant', 30)}
                                className="px-2.5 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[11px] font-bold shadow transition-all cursor-pointer"
                              >
                                + Grant 30d VIP
                              </button>
                            )}

                            <button
                              onClick={() => handleToggleBan(u.id, u.isSuspended)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                u.isSuspended
                                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {u.isSuspended ? 'Unban' : 'Ban'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PAYMENT QR & PRICING SETTINGS */}
        {activeTab === 'QR_SETTINGS' && (
          <div className="space-y-6">
            {qrSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{qrSuccessMsg}</span>
              </div>
            )}
            {qrErrorMsg && (
              <div className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{qrErrorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. Indian QR Code Slot */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🇮🇳</span>
                    <div>
                      <h4 className="text-sm font-black text-white">Indian Payment QR (UPI)</h4>
                      <p className="text-[11px] text-slate-400">Shown to Indian users paying with UPI apps</p>
                    </div>
                  </div>
                </div>

                {/* QR Preview Box */}
                <div className="relative w-48 h-56 mx-auto bg-white p-2.5 rounded-2xl border-2 border-pink-500/40 shadow-xl flex items-center justify-center">
                  <img
                    src={indiaQrPreview || qrSettings.paymentQrUrlIndia}
                    alt="Indian QR"
                    className="w-full h-full object-contain rounded-xl"
                  />
                </div>

                {/* File Upload Button */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => indiaFileRef.current?.click()}
                    className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload New Indian QR Image</span>
                  </button>
                  <input
                    ref={indiaFileRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleQrFile(e, 'india')}
                    className="hidden"
                  />
                </div>

                {/* Pricing Inputs */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Monthly Price (₹)</label>
                    <input
                      type="number"
                      value={qrSettings.indiaPriceMonthly}
                      onChange={(e) => setQrSettings({ ...qrSettings, indiaPriceMonthly: parseFloat(e.target.value) || 29 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Yearly Price (₹)</label>
                    <input
                      type="number"
                      value={qrSettings.indiaPriceYearly}
                      onChange={(e) => setQrSettings({ ...qrSettings, indiaPriceYearly: parseFloat(e.target.value) || 199 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                </div>

                {/* Merchant UPI ID */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Merchant UPI ID</label>
                  <input
                    type="text"
                    value={qrSettings.merchantUpiId}
                    onChange={(e) => setQrSettings({ ...qrSettings, merchantUpiId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-mono"
                  />
                </div>

                <button
                  type="button"
                  disabled={savingQr}
                  onClick={() => handleSaveQrSettings('india')}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-black shadow-lg shadow-pink-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingQr ? 'Saving...' : 'Save Indian QR & Settings'}
                </button>
              </div>

              {/* 2. International QR Code Slot */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🌍</span>
                    <div>
                      <h4 className="text-sm font-black text-white">International Payment QR</h4>
                      <p className="text-[11px] text-slate-400">PayPal / Wise / Global payment QR code</p>
                    </div>
                  </div>
                </div>

                {/* QR Preview Box */}
                <div className="relative w-48 h-56 mx-auto bg-white p-2.5 rounded-2xl border-2 border-blue-500/40 shadow-xl flex items-center justify-center">
                  <img
                    src={intlQrPreview || qrSettings.paymentQrUrlInternational}
                    alt="International QR"
                    className="w-full h-full object-contain rounded-xl"
                  />
                </div>

                {/* File Upload Button */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => intlFileRef.current?.click()}
                    className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload New International QR Image</span>
                  </button>
                  <input
                    ref={intlFileRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleQrFile(e, 'international')}
                    className="hidden"
                  />
                </div>

                {/* Pricing Inputs */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Monthly Price ($)</label>
                    <input
                      type="number"
                      value={qrSettings.intlPriceMonthly}
                      onChange={(e) => setQrSettings({ ...qrSettings, intlPriceMonthly: parseFloat(e.target.value) || 2 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Yearly Price ($)</label>
                    <input
                      type="number"
                      value={qrSettings.intlPriceYearly}
                      onChange={(e) => setQrSettings({ ...qrSettings, intlPriceYearly: parseFloat(e.target.value) || 12 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                </div>

                <div className="pt-8">
                  <button
                    type="button"
                    disabled={savingQr}
                    onClick={() => handleSaveQrSettings('international')}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingQr ? 'Saving...' : 'Save International QR & Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BROADCAST */}
        {activeTab === 'BROADCAST' && (
          <div className="max-w-xl mx-auto p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center space-x-2">
              <Radio className="w-5 h-5 text-pink-400" />
              <h4 className="text-sm font-black text-white">Broadcast Global System Notification</h4>
            </div>
            <p className="text-xs text-slate-400">
              Send an immediate system alert notification to all users on CupidX.
            </p>

            <form onSubmit={handleSendBroadcast} className="space-y-3">
              <textarea
                rows={4}
                placeholder="Type system announcement message here..."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="w-full p-3 rounded-2xl bg-black/60 border border-slate-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
              />

              {broadcastStatus && (
                <p className="text-xs font-bold text-pink-300">{broadcastStatus}</p>
              )}

              <button
                type="submit"
                disabled={sendingBroadcast || !broadcastMessage.trim()}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{sendingBroadcast ? 'Sending...' : 'Broadcast to All Users'}</span>
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Full Image Modal Lightbox */}
      {selectedFullImage && (
        <div
          onClick={() => setSelectedFullImage(null)}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-pointer"
        >
          <img
            src={selectedFullImage}
            alt="Full Receipt"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl border border-white/20"
          />
        </div>
      )}
    </div>
  );
}
