'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  Users,
  ShieldAlert,
  Sparkles,
  DollarSign,
  Megaphone,
  Ban,
  Trash2,
  CheckCircle,
  ArrowLeft,
  Activity,
  Heart,
  Zap
} from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

interface AdminStats {
  totalUsers: number;
  onlineUsers: number;
  vipUsers: number;
  totalRevenue: number;
  pendingReports: number;
}

interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  isSuspended: boolean;
  createdAt: string;
  profile?: {
    avatarUrl: string;
    gender: string;
    preferredGender: string;
    language: string;
  };
  subscription?: {
    isActive: boolean;
  };
}

interface AdminReport {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: {
    username: string;
  };
  reported: {
    username: string;
    isSuspended: boolean;
  };
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    onlineUsers: 0,
    vipUsers: 0,
    totalRevenue: 0,
    pendingReports: 0,
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);

  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcastSubmitting, setBroadcastSubmitting] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  const fetchAdminData = async () => {
    try {
      const statsRes = await fetch('/api/admin/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      const usersRes = await fetch('/api/admin/users');
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.users);
      }

      const reportsRes = await fetch('/api/admin/reports');
      if (reportsRes.ok) {
        const reportsData = await reportsRes.json();
        setReports(reportsData.reports);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      fetchAdminData();
    }
  }, [user]);

  const handleToggleSuspend = async (targetUserId: string, currentStatus: boolean) => {
    const actionText = currentStatus ? 'unsuspend' : 'suspend';
    if (confirm(`Are you sure you want to ${actionText} this user?`)) {
      try {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId, isSuspended: !currentStatus }),
        });
        if (res.ok) {
          setUsers((prev) =>
            prev.map((u) => (u.id === targetUserId ? { ...u, isSuspended: !currentStatus } : u))
          );
          fetchAdminData();
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteUser = async (targetUserId: string) => {
    if (confirm('CRITICAL: Permanently delete this account?')) {
      try {
        const res = await fetch(`/api/admin/users?userId=${targetUserId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
          fetchAdminData();
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleResolveReport = async (reportId: string) => {
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, status: 'RESOLVED' }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: 'RESOLVED' } : r))
        );
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastContent.trim()) return;

    setBroadcastSubmitting(true);
    setBroadcastSuccess(false);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: broadcastContent }),
      });
      if (res.ok) {
        setBroadcastSuccess(true);
        setBroadcastContent('');
        setTimeout(() => setBroadcastSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBroadcastSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0014]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-pink-500 animate-spin" />
          <span className="text-pink-300 text-sm">Opening CupidX Admin Console...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0014] p-4 sm:p-8 space-y-6 relative">
      <FloatingHearts />

      {/* Top Navigation */}
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-pink-500/10 pb-5">
        <div className="space-y-1">
          <Link href="/dashboard" className="inline-flex items-center space-x-1.5 text-xs text-pink-300 hover:text-white transition-colors mb-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Dashboard</span>
          </Link>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-500 flex items-center justify-center shadow-md">
              <Heart className="w-4 h-4 text-white fill-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              CupidX Omegle Admin Dashboard
            </h1>
          </div>
        </div>
      </div>

      {/* Analytics Metric Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-romantic rounded-2xl p-4 space-y-1">
          <div className="flex justify-between items-center text-pink-300">
            <span className="text-xs font-semibold uppercase">Total Accounts</span>
            <Users className="w-4 h-4 text-pink-400" />
          </div>
          <p className="text-2xl font-black text-white">{stats.totalUsers}</p>
        </div>

        <div className="glass-romantic rounded-2xl p-4 space-y-1">
          <div className="flex justify-between items-center text-pink-300">
            <span className="text-xs font-semibold uppercase">Online Users</span>
            <Activity className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-2xl font-black text-white">{stats.onlineUsers}</p>
        </div>

        <div className="glass-romantic rounded-2xl p-4 space-y-1">
          <div className="flex justify-between items-center text-pink-300">
            <span className="text-xs font-semibold uppercase">VIP Subscribers</span>
            <Sparkles className="w-4 h-4 text-yellow-400" />
          </div>
          <p className="text-2xl font-black text-white">{stats.vipUsers}</p>
        </div>

        <div className="glass-romantic rounded-2xl p-4 space-y-1">
          <div className="flex justify-between items-center text-pink-300">
            <span className="text-xs font-semibold uppercase">Total Revenue</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white">₹{stats.totalRevenue.toFixed(2)}</p>
        </div>

        <div className="glass-romantic rounded-2xl p-4 space-y-1 col-span-2 lg:col-span-1">
          <div className="flex justify-between items-center text-pink-300">
            <span className="text-xs font-semibold uppercase">Open Reports</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-white">{stats.pendingReports}</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Accounts List */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-pink-400" />
              User Account Moderation
            </h3>
            <div className="overflow-x-auto max-h-96 scrollbar-thin">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-pink-500/20 text-pink-300/70 uppercase font-semibold">
                    <th className="py-2.5 px-2">User</th>
                    <th className="py-2.5 px-2">Preferences</th>
                    <th className="py-2.5 px-2">VIP</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pink-500/10">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/2">
                      <td className="py-2.5 px-2">
                        <div className="flex items-center space-x-2">
                          <img
                            src={u.profile?.avatarUrl || '/default-avatar.png'}
                            alt={u.username}
                            className="w-7 h-7 rounded-full object-cover bg-slate-800 shrink-0"
                          />
                          <div className="overflow-hidden">
                            <span className="font-bold text-white block truncate">{u.fullName}</span>
                            <span className="text-[10px] text-pink-300/60">@{u.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-[10px] text-pink-200/80">
                        {u.profile?.gender || 'unspecified'} ➔ {u.profile?.preferredGender || 'any'}
                      </td>
                      <td className="py-2.5 px-2">
                        {u.subscription?.isActive ? (
                          <span className="text-yellow-400 font-bold text-[10px]">👑 VIP</span>
                        ) : (
                          <span className="text-pink-300/40 text-[10px]">Free</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right space-x-1.5">
                        <button
                          onClick={() => handleToggleSuspend(u.id, u.isSuspended)}
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] cursor-pointer ${
                            u.isSuspended
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          }`}
                        >
                          {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-[10px] cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Open Reports */}
          <div className="glass-romantic rounded-3xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Random Chat Abuse Reports
            </h3>
            {reports.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {reports.map((r) => (
                  <div key={r.id} className="p-3.5 rounded-2xl bg-white/3 border border-pink-500/20 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-pink-300">@{r.reporter.username} reported @{r.reported.username}</span>
                      <span className="text-[10px] text-pink-300/40">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-pink-100 bg-black/30 p-2 rounded-xl">"{r.reason}"</p>
                    <div className="flex justify-end space-x-2">
                      {r.status === 'PENDING' ? (
                        <button
                          onClick={() => handleResolveReport(r.id)}
                          className="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-bold cursor-pointer"
                        >
                          Mark Resolved
                        </button>
                      ) : (
                        <span className="text-xs text-green-400 font-bold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-pink-300/50 text-center py-4">No open abuse reports</p>
            )}
          </div>
        </div>

        {/* Broadcast Form */}
        <div>
          <div className="glass-romantic rounded-3xl p-6 space-y-4 sticky top-6">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-pink-400" />
              System Announcement
            </h3>
            <p className="text-xs text-pink-200/70">
              Emit a system bulletin notification to all CupidX users.
            </p>
            <form onSubmit={handleBroadcast} className="space-y-3">
              <textarea
                required
                rows={5}
                value={broadcastContent}
                onChange={(e) => setBroadcastContent(e.target.value)}
                placeholder="Type system announcement..."
                className="w-full px-3 py-2 rounded-xl glass-input text-xs"
              />

              {broadcastSuccess && (
                <div className="p-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-xs text-green-400 text-center font-bold">
                  Broadcast sent successfully!
                </div>
              )}

              <button
                type="submit"
                disabled={broadcastSubmitting || !broadcastContent.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {broadcastSubmitting ? 'Sending...' : 'Emit Broadcast'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
