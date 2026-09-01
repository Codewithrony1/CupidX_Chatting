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
  FileText,
  CreditCard,
  Eye,
  CheckSquare,
  AlertTriangle,
  History,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface StatData {
  totalUsers: number;
  vipUsers: number;
  pendingRequests: number;
  approvedToday?: number;
  rejectedToday?: number;
  activeSubscriptions?: number;
  totalApprovedRevenue?: number;
  activeChats: number;
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
  clerkUserId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  username: string;
  plan: string;
  planId?: string;
  region: 'india' | 'international';
  amount: number;
  currency: string;
  paymentId?: string | null;
  screenshotUrl?: string | null;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  user?: {
    id: string;
    clerkUserId?: string;
    username: string;
    email?: string;
    fullName: string;
  };
}

interface AuditLogItem {
  id: string;
  action: string;
  adminClerkId?: string | null;
  details?: string | null;
  createdAt: string;
  admin?: {
    username: string;
    email?: string;
  };
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'SUBSCRIPTIONS' | 'USERS' | 'SETTINGS' | 'AUDIT_LOGS' | 'BROADCAST'>('PAYMENTS');

  // Stats
  const [stats, setStats] = useState<StatData>({
    totalUsers: 0,
    vipUsers: 0,
    pendingRequests: 0,
    approvedToday: 0,
    rejectedToday: 0,
    activeSubscriptions: 0,
    totalApprovedRevenue: 0,
    activeChats: 0,
  });

  // Requests state
  const [requests, setRequests] = useState<PaymentRequestItem[]>([]);
  const [requestStatusFilter, setRequestStatusFilter] = useState<'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'all'>('UNDER_REVIEW');
  const [requestRegionFilter, setRequestRegionFilter] = useState<'all' | 'india' | 'international'>('all');
  const [requestSearch, setRequestSearch] = useState('');
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);
  const [selectedDetailPayment, setSelectedDetailPayment] = useState<PaymentRequestItem | null>(null);

  // Users state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userPlanFilter, setUserPlanFilter] = useState<'all' | 'vip' | 'free'>('all');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // QR Settings state
  const [qrSettings, setQrSettings] = useState({
    paymentQrUrlIndia: '/uploads/qr/payment-qr-india.jpg',
    paymentQrUrlInternational: '/lexino-qr.jpg',
    merchantUpiId: 'cupidxchat@upi',
    receiverName: 'CupidxChat',
    indiaInstructions: 'Scan the QR code using any UPI app (GPay, PhonePe, Paytm, BHIM) and complete payment.',
    internationalMethod: 'PayPal / Wise / Cards',
    internationalDetails: 'Contact admin@cupidxchat.in for direct international billing',
    internationalCurrency: 'USD',
    internationalInstructions: 'Scan international QR or send via PayPal, then submit transaction ID.',
    indiaPriceMonthly: 29,
    indiaPriceYearly: 199,
    intlPriceMonthly: 2,
    intlPriceYearly: 12,
  });
  const [savingQr, setSavingQr] = useState(false);
  const [qrSuccessMsg, setQrSuccessMsg] = useState('');
  const [qrErrorMsg, setQrErrorMsg] = useState('');

  // Indian & International QR Preview
  const [indiaQrPreview, setIndiaQrPreview] = useState<string | null>(null);
  const [intlQrPreview, setIntlQrPreview] = useState<string | null>(null);
  const indiaFileRef = useRef<HTMLInputElement>(null);
  const intlFileRef = useRef<HTMLInputElement>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

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
        if (data.stats) {
          setStats((prev) => ({
            ...prev,
            ...data.stats,
            activeSubscriptions: data.stats.vipUsers || 0,
          }));
        }
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
        const rawRequests: PaymentRequestItem[] = data.requests || [];
        setRequests(rawRequests);

        // Compute revenue & counts
        const approvedReqs = rawRequests.filter((r) => r.status === 'APPROVED' || r.status === 'approved');
        const revenue = approvedReqs.reduce((acc, r) => acc + (r.amount || 0), 0);
        const rejectedReqs = rawRequests.filter((r) => r.status === 'REJECTED' || r.status === 'rejected');

        setStats((prev) => ({
          ...prev,
          totalApprovedRevenue: revenue,
          approvedToday: approvedReqs.length,
          rejectedToday: rejectedReqs.length,
        }));
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
        setQrSettings((prev) => ({
          ...prev,
          paymentQrUrlIndia: data.paymentQrUrlIndia || '/uploads/qr/payment-qr-india.jpg',
          paymentQrUrlInternational: data.paymentQrUrlInternational || '/lexino-qr.jpg',
          merchantUpiId: data.merchantUpiId || 'cupidxchat@upi',
          indiaPriceMonthly: data.pricing?.india?.monthly || 29,
          indiaPriceYearly: data.pricing?.india?.yearly || 199,
          intlPriceMonthly: data.pricing?.international?.monthly || 2,
          intlPriceYearly: data.pricing?.international?.yearly || 12,
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fetch Audit Logs
  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const res = await fetch('/api/admin/audit-logs');
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchRequests();
    fetchUsers();
    fetchQrSettings();
    fetchAuditLogs();

    // Auto-refresh polling every 5s for real-time payments queue
    const interval = setInterval(() => {
      fetchStats();
      fetchRequests();
    }, 5000);

    return () => clearInterval(interval);
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

  // APPROVE & ACTIVATE Payment Request
  const handleApproveRequest = async (requestId: string) => {
    // Optimistic UI update
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId || r.requestId === requestId ? { ...r, status: 'APPROVED' } : r))
    );
    if (selectedDetailPayment?.id === requestId || selectedDetailPayment?.requestId === requestId) {
      setSelectedDetailPayment(null);
    }

    try {
      const res = await fetch(`/api/admin/payment-requests/${requestId}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchStats();
        fetchUsers();
        fetchAuditLogs();
        try {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 } });
        } catch (e) {}
      } else {
        fetchRequests(); // Revert on failure
      }
    } catch (e) {
      console.error(e);
      fetchRequests();
    }
  };

  // REJECT Payment Request
  const handleRejectRequest = async (requestId: string) => {
    const reason = rejectReason.trim() || 'UTR does not match or payment proof could not be verified.';

    // Optimistic UI update
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId || r.requestId === requestId ? { ...r, status: 'REJECTED', rejectionReason: reason } : r))
    );
    setRejectingId(null);
    setRejectReason('');
    if (selectedDetailPayment?.id === requestId || selectedDetailPayment?.requestId === requestId) {
      setSelectedDetailPayment(null);
    }

    try {
      const res = await fetch(`/api/admin/payment-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        fetchStats();
        fetchAuditLogs();
      } else {
        fetchRequests();
      }
    } catch (e) {
      console.error(e);
      fetchRequests();
    }
  };

  // Toggle Subscription Direct (Activate / Deactivate)
  const handleSubscriptionToggle = async (userId: string, currentActive: boolean) => {
    try {
      const endpoint = currentActive
        ? `/api/admin/subscriptions/${userId}/deactivate`
        : `/api/admin/subscriptions/${userId}/activate`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 30 }),
      });
      if (res.ok) {
        fetchUsers();
        fetchStats();
        fetchAuditLogs();
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
        fetchAuditLogs();
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
        fetchAuditLogs();
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
        fetchAuditLogs();
      } else {
        setBroadcastStatus('Failed to send broadcast.');
      }
    } catch (e) {
      setBroadcastStatus('Error sending broadcast.');
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Filter requests by search
  const filteredRequests = requests.filter((r) => {
    if (!requestSearch) return true;
    const term = requestSearch.toLowerCase();
    return (
      r.requestId.toLowerCase().includes(term) ||
      (r.userEmail || '').toLowerCase().includes(term) ||
      (r.userName || '').toLowerCase().includes(term) ||
      r.username.toLowerCase().includes(term) ||
      (r.paymentId || '').toLowerCase().includes(term) ||
      (r.clerkUserId || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-[#06000c] text-slate-100 pb-20 font-sans">
      {/* LOCAL ADMIN CONSOLE BANNER */}
      <div className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 px-4 py-1 text-center text-[11px] font-black tracking-wider uppercase text-white shadow-md flex items-center justify-center gap-2">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>LOCAL ADMIN CONSOLE (PORT 3001) • LIVE SHARED DATABASE CONNECTED</span>
      </div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#0c0116]/95 backdrop-blur-xl border-b border-pink-500/20 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl shadow-pink-500/5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                <span>CupidxChat Admin Dashboard</span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Manual Payment Verification • Clerk User Identity • Subscription Management
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard"
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold border border-white/10 transition-colors flex items-center gap-1.5"
          >
            <span>Live Site</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={() => {
              fetchStats();
              fetchRequests();
              fetchUsers();
              fetchAuditLogs();
            }}
            className="px-3.5 py-2 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="Refresh All Data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>REFRESH</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* PROMINENT NEW PAYMENT NOTIFICATION BANNER */}
        {stats.pendingRequests > 0 && (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-rose-600/30 via-pink-600/20 to-purple-600/20 border-2 border-rose-500/50 shadow-2xl shadow-rose-500/20 flex flex-wrap items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/30 text-rose-300 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <span>🔴 NEW PAYMENT PENDING REVIEW ({stats.pendingRequests})</span>
                </h4>
                <p className="text-xs text-rose-200/80 font-medium">
                  Users have submitted manual QR payment proofs. Review UTR & screenshot to approve & activate subscriptions.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveTab('PAYMENTS');
                setRequestStatusFilter('UNDER_REVIEW');
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-500/30 transition-all cursor-pointer"
            >
              [ REVIEW NOW ]
            </button>
          </div>
        )}

        {/* DASHBOARD STAT CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-pink-300 uppercase tracking-wider">Pending Payments</p>
              <h3 className="text-2xl font-black text-pink-400 mt-0.5">{stats.pendingRequests}</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-pink-500/20 text-pink-400 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Approved Today</p>
              <h3 className="text-2xl font-black text-emerald-400 mt-0.5">{stats.approvedToday || 0}</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Rejected Today</p>
              <h3 className="text-2xl font-black text-rose-400 mt-0.5">{stats.rejectedToday || 0}</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
              <XCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Active Subscriptions</p>
              <h3 className="text-2xl font-black text-yellow-400 mt-0.5">{stats.vipUsers}</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold">
              <Crown className="w-5 h-5 fill-current" />
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 p-4 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-md shadow-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Approved Revenue</p>
              <h3 className="text-2xl font-black text-white mt-0.5">₹{stats.totalApprovedRevenue || 0}</h3>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('PAYMENTS')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'PAYMENTS'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Payments Queue</span>
            {stats.pendingRequests > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-yellow-400 text-slate-950 text-[10px] font-black">
                {stats.pendingRequests}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('SUBSCRIPTIONS')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'SUBSCRIPTIONS'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>Subscriptions</span>
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
            <span>Users & Clerk Auth</span>
          </button>

          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'SETTINGS'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Payment Settings</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT_LOGS')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'AUDIT_LOGS'
                ? 'bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Logs</span>
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

        {/* TAB 1: PAYMENTS QUEUE & VERIFICATION */}
        {activeTab === 'PAYMENTS' && (
          <div className="space-y-4">
            {/* Filters Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-3xl bg-slate-900/80 border border-slate-800">
              {/* Status Filter */}
              <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-2xl border border-slate-800">
                {(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setRequestStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
                      requestStatusFilter === s
                        ? 'bg-pink-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s === 'UNDER_REVIEW' ? 'Under Review' : s}
                  </button>
                ))}
              </div>

              {/* Search by ID, Email, UTR, Clerk ID */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by Payment ID, Gmail, UTR, Clerk ID..."
                  value={requestSearch}
                  onChange={(e) => setRequestSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-2xl bg-black/40 border border-slate-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              {/* Region Filter */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-400">Region:</span>
                <select
                  value={requestRegionFilter}
                  onChange={(e) => setRequestRegionFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl bg-black/60 border border-slate-800 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                >
                  <option value="all">All Regions</option>
                  <option value="india">🇮🇳 India (UPI)</option>
                  <option value="international">🌍 International</option>
                </select>
              </div>
            </div>

            {/* Payment List */}
            {loadingRequests ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-pink-500 animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-400">Loading payment submissions...</p>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">No payment submissions found</h4>
                <p className="text-xs text-slate-400">All submissions in this view have been processed.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredRequests.map((req) => (
                  <div
                    key={req.id}
                    className={`p-5 rounded-3xl border transition-all space-y-4 relative ${
                      req.status === 'UNDER_REVIEW' || req.status === 'pending'
                        ? 'bg-gradient-to-br from-slate-900/90 via-[#130122]/80 to-slate-900/90 border-pink-500/40 shadow-xl shadow-pink-500/5'
                        : req.status === 'APPROVED' || req.status === 'approved'
                        ? 'bg-slate-900/60 border-emerald-500/30'
                        : 'bg-slate-900/40 border-slate-800'
                    }`}
                  >
                    {/* Header: Payment ID & Status */}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20">
                          {req.requestId}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Submitted: {new Date(req.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                          req.status === 'UNDER_REVIEW' || req.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : req.status === 'APPROVED' || req.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {req.status === 'UNDER_REVIEW' || req.status === 'pending' ? 'UNDER REVIEW' : req.status}
                      </span>
                    </div>

                    {/* Customer Identity Box (Clerk Linked) */}
                    <div className="p-3.5 rounded-2xl bg-black/50 border border-white/5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">Customer Name</span>
                        <span className="font-bold text-white">👤 {req.userName || req.username}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">Gmail / Email</span>
                        <span className="font-mono font-bold text-pink-300">✉️ {req.userEmail || 'No Email'}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-bold uppercase text-[10px]">Clerk User ID</span>
                        <span className="font-mono text-slate-300 text-[10px]">{req.clerkUserId || 'N/A'}</span>
                      </div>
                    </div>

                    {/* Plan, Amount & UTR Details */}
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/40 border border-white/5 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Plan</span>
                        <span className="font-extrabold text-yellow-300 capitalize">{req.plan}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Amount</span>
                        <span className="font-extrabold text-white">
                          {req.currency === 'USD' ? '$' : '₹'}{req.amount} ({req.region === 'india' ? '🇮🇳 India' : '🌍 International'})
                        </span>
                      </div>

                      {req.paymentId && (
                        <div className="col-span-2 pt-1 border-t border-white/5 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase">UTR / Transaction ID</span>
                            <span className="font-mono font-bold text-yellow-400 text-xs">{req.paymentId}</span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(req.paymentId!, req.id)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="Copy UTR ID"
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
                          Payment Screenshot (Secure Viewer)
                        </span>
                        <div
                          onClick={() => setSelectedFullImage(req.screenshotUrl!)}
                          className="relative w-full h-36 rounded-2xl overflow-hidden border border-white/10 cursor-pointer group bg-black"
                        >
                          <img
                            src={req.screenshotUrl}
                            alt="Receipt"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="px-3 py-1.5 rounded-xl bg-black/80 text-white text-xs font-bold flex items-center gap-1.5">
                              <Eye className="w-3.5 h-3.5" />
                              <span>View High-Res Proof</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rejection Reason if Rejected */}
                    {(req.status === 'REJECTED' || req.status === 'rejected') && req.rejectionReason && (
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
                        <span className="font-bold">Rejection Reason:</span> {req.rejectionReason}
                      </div>
                    )}

                    {/* Action Buttons */}
                    {(req.status === 'UNDER_REVIEW' || req.status === 'pending') && (
                      <div className="pt-2 border-t border-white/10 space-y-2">
                        {rejectingId === req.id ? (
                          <div className="space-y-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                            <input
                              type="text"
                              placeholder="Why are you rejecting this payment? (e.g. UTR does not match)..."
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
                              className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>✓ APPROVE & ACTIVATE</span>
                            </button>

                            <button
                              onClick={() => {
                                setRejectingId(req.id);
                                setRejectReason('');
                              }}
                              className="px-4 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
                            >
                              ❌ REJECT
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

        {/* TAB 2: SUBSCRIPTIONS MANAGEMENT */}
        {activeTab === 'SUBSCRIPTIONS' && (
          <div className="space-y-4">
            <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Active Subscriptions Management</h4>
                <p className="text-xs text-slate-400">Directly activate or deactivate user VIP subscriptions</p>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/40 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Customer</th>
                    <th className="px-5 py-3.5">Email</th>
                    <th className="px-5 py-3.5">Subscription Status</th>
                    <th className="px-5 py-3.5">Expires At</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-white block">@{u.username}</span>
                        <span className="text-[10px] text-slate-400">{u.fullName}</span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-pink-300">{u.email}</td>
                      <td className="px-5 py-3.5">
                        {u.is_vip ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            🟢 ACTIVE VIP
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold text-[10px]">
                            INACTIVE
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-slate-300">
                        {u.vip_expires_at ? new Date(u.vip_expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        {u.is_vip ? (
                          <button
                            onClick={() => handleSubscriptionToggle(u.id, true)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30 cursor-pointer"
                          >
                            Deactivate Plan
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSubscriptionToggle(u.id, false)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                          >
                            [ ACTIVATE PLAN ]
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: USERS & CLERK AUTH */}
        {activeTab === 'USERS' && (
          <div className="space-y-4">
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
                  <option value="all">All Users</option>
                  <option value="vip">VIP Users Only</option>
                  <option value="free">Free Users Only</option>
                </select>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/40 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-5 py-3.5">Email (Clerk)</th>
                    <th className="px-5 py-3.5">Clerk User ID</th>
                    <th className="px-5 py-3.5">Plan</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-white block">@{u.username}</span>
                        <span className="text-[10px] text-slate-400">{u.fullName}</span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-pink-300">{u.email}</td>
                      <td className="px-5 py-3.5 font-mono text-slate-400 text-[10px]">{u.clerkUserId || 'N/A'}</td>
                      <td className="px-5 py-3.5">
                        {u.is_vip ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 font-black text-[10px] border border-yellow-500/30">
                            👑 VIP
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold text-[10px]">
                            FREE
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {u.isSuspended ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                            Suspended
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleToggleBan(u.id, u.isSuspended)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-700 hover:border-slate-500 cursor-pointer"
                        >
                          {u.isSuspended ? 'Unban' : 'Ban'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: PAYMENT SETTINGS */}
        {activeTab === 'SETTINGS' && (
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
                      <h4 className="text-sm font-black text-white">Indian Payment Settings (UPI)</h4>
                      <p className="text-[11px] text-slate-400">Configure Indian QR code image and UPI Receiver details</p>
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

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Receiver UPI ID</label>
                  <input
                    type="text"
                    value={qrSettings.merchantUpiId}
                    onChange={(e) => setQrSettings({ ...qrSettings, merchantUpiId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Receiver Name</label>
                  <input
                    type="text"
                    value={qrSettings.receiverName}
                    onChange={(e) => setQrSettings({ ...qrSettings, receiverName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Monthly (₹)</label>
                    <input
                      type="number"
                      value={qrSettings.indiaPriceMonthly}
                      onChange={(e) => setQrSettings({ ...qrSettings, indiaPriceMonthly: parseFloat(e.target.value) || 29 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Yearly (₹)</label>
                    <input
                      type="number"
                      value={qrSettings.indiaPriceYearly}
                      onChange={(e) => setQrSettings({ ...qrSettings, indiaPriceYearly: parseFloat(e.target.value) || 199 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={savingQr}
                  onClick={() => handleSaveQrSettings('india')}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-black shadow-lg shadow-pink-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingQr ? 'Saving...' : 'Save Indian Payment Settings'}
                </button>
              </div>

              {/* 2. International Settings Slot */}
              <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🌍</span>
                    <div>
                      <h4 className="text-sm font-black text-white">International Payment Settings</h4>
                      <p className="text-[11px] text-slate-400">Configure global QR and international payment instructions</p>
                    </div>
                  </div>
                </div>

                <div className="relative w-48 h-56 mx-auto bg-white p-2.5 rounded-2xl border-2 border-blue-500/40 shadow-xl flex items-center justify-center">
                  <img
                    src={intlQrPreview || qrSettings.paymentQrUrlInternational}
                    alt="International QR"
                    className="w-full h-full object-contain rounded-xl"
                  />
                </div>

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

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">Payment Instructions</label>
                  <input
                    type="text"
                    value={qrSettings.internationalInstructions}
                    onChange={(e) => setQrSettings({ ...qrSettings, internationalInstructions: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Monthly ($)</label>
                    <input
                      type="number"
                      value={qrSettings.intlPriceMonthly}
                      onChange={(e) => setQrSettings({ ...qrSettings, intlPriceMonthly: parseFloat(e.target.value) || 2 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">Yearly ($)</label>
                    <input
                      type="number"
                      value={qrSettings.intlPriceYearly}
                      onChange={(e) => setQrSettings({ ...qrSettings, intlPriceYearly: parseFloat(e.target.value) || 12 })}
                      className="w-full px-3 py-2 rounded-xl bg-black/60 border border-slate-800 text-xs text-white font-bold"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={savingQr}
                    onClick={() => handleSaveQrSettings('international')}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {savingQr ? 'Saving...' : 'Save International Payment Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AUDIT LOGS */}
        {activeTab === 'AUDIT_LOGS' && (
          <div className="space-y-4">
            <div className="p-4 rounded-3xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">Immutable Audit Trail</h4>
                <p className="text-xs text-slate-400">All payment submissions, approvals, rejections, and manual plan changes</p>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/40 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5">Action</th>
                    <th className="px-5 py-3.5">Admin / Actor</th>
                    <th className="px-5 py-3.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {loadingAuditLogs ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-slate-400">Loading audit trail...</td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-slate-400">No audit logs recorded yet.</td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="px-5 py-3 font-bold text-pink-300">{log.action}</td>
                        <td className="px-5 py-3 text-slate-300">@{log.admin?.username || 'admin'}</td>
                        <td className="px-5 py-3 text-slate-300">{log.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: BROADCAST */}
        {activeTab === 'BROADCAST' && (
          <div className="max-w-xl mx-auto p-6 rounded-3xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center space-x-2">
              <Radio className="w-5 h-5 text-pink-400" />
              <h4 className="text-sm font-black text-white">Broadcast Global System Alert</h4>
            </div>
            <p className="text-xs text-slate-400">
              Send an immediate system alert notification to all users across CupidxChat.
            </p>

            <form onSubmit={handleSendBroadcast} className="space-y-3">
              <textarea
                rows={4}
                placeholder="Type global announcement message here..."
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
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4 cursor-pointer backdrop-blur-lg"
        >
          <div className="max-w-3xl max-h-[90vh] bg-slate-950 p-2 rounded-3xl border border-white/20 shadow-2xl relative">
            <img
              src={selectedFullImage}
              alt="Full Receipt"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain"
            />
            <p className="text-center text-xs text-slate-400 mt-2 font-bold">Click anywhere to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
