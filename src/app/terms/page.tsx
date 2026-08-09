'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, FileText, AlertOctagon, Heart } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function TermsPage() {
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
            <FileText className="w-6 h-6 text-pink-400" />
            <h1 className="text-2xl font-black text-white tracking-tight">Terms of Service</h1>
          </div>
        </div>

        {/* Content Card */}
        <div className="glass-romantic rounded-3xl p-6 sm:p-8 space-y-6 text-xs sm:text-sm text-pink-100/90 leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-pink-400" />
              1. Community Acceptable Use
            </h2>
            <p>
              Cupidx is intended for respectful, positive social connections. Users must be at least 18 years of age.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              2. Prohibited Conduct
            </h2>
            <ul className="list-disc pl-5 space-y-1 text-pink-200/80">
              <li>No harassment, abuse, hate speech, or threatening behavior.</li>
              <li>No spam, automated bots, or distribution of malicious links.</li>
              <li>No impersonation of reserved system accounts (@admin, @system, @cupidx, etc.).</li>
              <li>No illegal content or non-consensual sharing.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-pink-400" />
              3. Enforcement & Suspension
            </h2>
            <p>
              Cupidx reserves the right to suspend or ban any account that violates our community standards or engages in abusive behavior.
            </p>
          </section>

          <section className="space-y-2 border-t border-pink-500/20 pt-4">
            <p className="text-xs text-pink-300/60">
              Last updated: {new Date().toLocaleDateString()} • Cupidx Terms of Service
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
