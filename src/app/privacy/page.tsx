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
              1. What We Collect & Why (Ephemeral vs. Persistent Data)
            </h2>
            <p>
              CupidX (cupidxchat.in) is engineered with a strict distinction between <strong>ephemeral random communication</strong> and <strong>persistent account credentials</strong>:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>
                <strong>Ephemeral Chat Messages & Media (Temporary):</strong> Messages, text snippets, and emojis sent during 1-to-1 random chat sessions are strictly ephemeral. They are routed via encrypted WebSockets (WSS) and are automatically destroyed from server memory and databases immediately when either participant presses NEXT or disconnects.
              </li>
              <li>
                <strong>Persistent Profile Identity:</strong> To allow you to log in, maintain your identity, and access VIP perks, we securely store your chosen unique @username, public display name, date of birth (collected exclusively to ensure 18+ age verification and child safety legal compliance), gender preferences, avatar (emoji or VIP uploaded profile image), and short bio.
              </li>
              <li>
                <strong>Authentication Credentials:</strong> Securely handled by Clerk. We do not store your raw passwords on our application servers.
              </li>
              <li>
                <strong>VIP Payment Records:</strong> Transaction IDs (UTR) and payment screenshot proofs submitted by users solely for manual VIP membership verification and activation.
              </li>
              <li>
                <strong>Platform Integrity & Abuse Prevention:</strong> Rate-limiting metrics, abuse report flags, and block records used solely to prevent bots, harassment, and unauthorized access.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-400" />
              2. Profile Privacy & Random Chat Partner Isolation
            </h2>
            <p>
              When you join the random matching queue, CupidX strictly isolates your private information:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>Your chat partner <strong>NEVER</strong> receives access to your email address, phone number, Clerk User ID, internal database identifiers, or IP address.</li>
              <li>Random partners only see your public profile representation: your display name, @username, avatar emoji/DP, gender tag, and age.</li>
              <li>You have full autonomy to skip any conversation instantly by clicking NEXT.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              3. Message Storage, Ephemeral Architecture & DP Security
            </h2>
            <p>
              We believe romantic conversations should stay private between two individuals:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong>Zero Permanent Chat Archives:</strong> We do not log, retain, or index chat transcripts from random chat sessions. Once a session ends, the temporary messages are wiped.</li>
              <li><strong>Profile Photo (DP) Storage:</strong> Custom profile pictures uploaded by VIP members are stored securely in protected storage. They are never shared with advertising networks, third-party data aggregators, or search engines.</li>
              <li><strong>Transport Encryption:</strong> All client-to-server traffic is protected using modern Transport Layer Security (TLS/HTTPS) and Secure WebSockets (WSS).</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              4. Third-Party Infrastructure & Safety Compliance
            </h2>
            <p>
              We utilize trusted infrastructure providers including Clerk (Authentication) and encrypted cloud databases. We never sell, rent, or trade your personal information or profile data to third parties. We comply with all applicable digital safety, age gate, and data protection standards.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              5. User Rights & Permanent Account Deletion
            </h2>
            <p>
              You maintain total ownership of your personal profile data. You have the right to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>Edit or remove your display name, bio, and avatar at any time from your Profile Settings.</li>
              <li>
                <strong>Permanently Delete Your Account:</strong> At any time, you can click <em>Delete Account</em> in your Settings. This triggers an immediate, irreversible database transaction that deletes your user record, profile data, uploaded photos, friends, block lists, and authentication sessions.
              </li>
            </ul>
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
