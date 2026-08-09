'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, Lock, Trash2, Heart } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0d0014] text-white p-4 sm:p-8 relative selection:bg-pink-500 selection:text-white">
      <FloatingHearts />

      <div className="max-w-4xl mx-auto space-y-6 relative z-10">
        {/* Navigation */}
        <div className="flex items-center space-x-3 border-b border-pink-500/20 pb-5">
          <Link
            href="/"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-pink-300 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center space-x-2">
            <Shield className="w-6 h-6 text-pink-400" />
            <h1 className="text-2xl font-black text-white tracking-tight">Privacy Policy</h1>
          </div>
        </div>

        {/* Content Card */}
        <div className="glass-romantic rounded-3xl p-6 sm:p-8 space-y-6 text-xs sm:text-sm text-pink-100/90 leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-pink-400" />
              1. Ephemeral Temporary Chat Architecture
            </h2>
            <p>
              Cupidx is built on temporary 1-to-1 conversations. When you press <strong className="text-white">NEXT</strong> or <strong className="text-white">End Chat</strong>, the current conversation and all associated temporary messages are <strong className="text-rose-400">permanently deleted on the server</strong>. We do not maintain permanent conversation histories or log message text.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-pink-400" />
              2. Information We Collect
            </h2>
            <p>
              We collect minimal information required to operate Cupidx:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-pink-200/80">
              <li>Authentication details via Clerk (Email, User ID).</li>
              <li>Unique username (@username) chosen upon registration.</li>
              <li>Profile preferences (display name, avatar URL, gender, language).</li>
              <li>Operational audit logs for rate-limiting, abuse prevention, and report investigation.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              3. Account & Data Deletion
            </h2>
            <p>
              You have full right to delete your account at any time via Settings. Account deletion permanently removes your profile, active chat sessions, messages, block lists, and notifications from our servers.
            </p>
          </section>

          <section className="space-y-2 border-t border-pink-500/20 pt-4">
            <p className="text-xs text-pink-300/60">
              Last updated: {new Date().toLocaleDateString()} • Cupidx Privacy & Safety Architecture
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
