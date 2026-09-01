'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, Lock, Trash2, Heart, EyeOff, Server, UserCheck } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#07000e] text-white p-4 sm:p-8 relative selection:bg-pink-500 selection:text-white">
      <FloatingHearts />

      <div className="max-w-4xl mx-auto space-y-6 relative z-10">
        {/* Navigation */}
        <div className="flex items-center justify-between border-b border-pink-500/20 pb-5">
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center space-x-2">
              <Shield className="w-6 h-6 text-pink-400" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Privacy Policy</h1>
            </div>
          </div>
          <Link href="/" className="flex items-center space-x-1.5 text-sm font-bold text-pink-300">
            <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
            <span>CupidX</span>
          </Link>
        </div>

        {/* Content Card */}
        <div className="rounded-3xl bg-[#11001c]/90 border border-pink-500/20 p-6 sm:p-8 space-y-6 text-xs sm:text-sm text-slate-300 leading-relaxed shadow-2xl backdrop-blur-md">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-pink-400" />
              1. What We Collect & Why
            </h2>
            <p>
              CupidX (cupidxchat.in) is committed to protecting your personal privacy. We collect only the data necessary to provide and secure our real-time matching and anonymous chat services:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong>Authentication Data:</strong> Handled securely via Clerk (email address, Clerk User ID, verified account credentials).</li>
              <li><strong>Profile Information:</strong> Public display name, unique username, optional gender, age, avatar emoji or image, and self-described bio.</li>
              <li><strong>Payment Records:</strong> UTR/transaction ID and submitted payment screenshots solely for manual VIP membership verification and activation.</li>
              <li><strong>Technical Metadata:</strong> WebSocket connection state, timestamps, and rate-limiting metrics used to maintain platform stability and prevent spam.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-400" />
              2. Profile Privacy & Random Chat Isolation
            </h2>
            <p>
              When participating in random matchmaking, your chat partner <strong>NEVER</strong> receives access to your email address, Clerk User ID, internal database identifiers, or IP address. Partners only receive public information (your display name, gender, and avatar emoji).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              3. Message Storage & Retention
            </h2>
            <p>
              Messages transmitted during random chats are handled over secure encrypted transport (HTTPS / WSS). When a session ends or a user clicks NEXT, the active connection is closed immediately and temporary messages are removed according to cleanup policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              4. Third-Party Integrations & Security Practices
            </h2>
            <p>
              We utilize trusted infrastructure providers including Clerk for secure authentication and transport encryption (TLS/HTTPS/WSS) across all endpoints. We never sell, rent, or monetize your personal data with third-party advertisers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              5. User Rights & Account Deletion
            </h2>
            <p>
              You have the full right to edit your profile, update your preferences, or permanently delete your account at any time via Settings. Account deletion removes your user profile, active sessions, block lists, and notifications.
            </p>
          </section>

          <div className="border-t border-pink-500/20 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} CupidX (cupidxchat.in). All rights reserved.</span>
            <div className="flex space-x-4">
              <Link href="/privacy" className="hover:text-pink-400 transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-pink-400 transition-colors">Terms</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
