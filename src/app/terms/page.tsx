'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Shield, FileText, AlertOctagon, Heart, Lock, HelpCircle } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function TermsPage() {
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
              <FileText className="w-6 h-6 text-pink-400" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Terms of Service</h1>
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
              <Shield className="w-4 h-4 text-pink-400" />
              1. Eligibility & Account Responsibility
            </h2>
            <p>
              You must be at least 18 years of age (or the age of legal majority in your jurisdiction) to use CupidX (cupidxchat.in). By creating an account or accessing the platform, you represent and warrant that you meet this age requirement and have the legal capacity to enter into these Terms. You are solely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              2. Acceptable Use & Prohibited Behavior
            </h2>
            <p>
              CupidX is designed for fun, anonymous, and respectful real-time social conversations. We strictly prohibit the following behaviors:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li><strong>Zero Tolerance for Child Exploitation:</strong> Any child sexual abuse material (CSAM) or sexual exploitation involving minors will result in immediate permanent banning and immediate reporting to law enforcement authorities.</li>
              <li><strong>Harassment & Threats:</strong> Harassment, stalking, intimidation, extortion, hate speech, or threatening violence against any user.</li>
              <li><strong>Non-consensual Content:</strong> Sharing non-consensual explicit imagery, private personal data (doxxing), or unauthorized media.</li>
              <li><strong>Spam & Malicious Activity:</strong> Automated bot messaging, unsolicited advertising, affiliate link spamming, malware, or phishing links.</li>
              <li><strong>Impersonation:</strong> Impersonating other individuals, platform administrators, or system staff.</li>
              <li><strong>Illegal Activities:</strong> Using the service for illegal transactions, solicitation, or unlawful actions under applicable law.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              3. Platform Moderation & Reporting
            </h2>
            <p>
              We maintain in-chat reporting and blocking tools allowing users to report abusive conduct and immediately end connections. CupidX reserves the right, at its sole discretion, to investigate reports, suspend accounts, revoke VIP entitlements, and permanently ban users violating these Terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-yellow-400" />
              4. VIP Membership Purchases & Manual Verification
            </h2>
            <p>
              CupidX offers optional VIP subscriptions granting enhanced features (such as image sharing in chat and custom avatar privileges). VIP payments in India are processed manually via dynamic UPI QR code scanning and administrative verification. VIP memberships are digital services that activate upon verification. All sales are final and non-refundable once activated, except as required by applicable mandatory consumer laws.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              5. Limitation of Liability & Disclaimers
            </h2>
            <p>
              CupidX is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of any kind. To the maximum extent permitted by law, CupidX and its operators disclaim all liability for any indirect, incidental, punitive, or consequential damages resulting from your use of or inability to use the service, or interactions with other users.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-pink-400" />
              6. Changes to Terms & Contact
            </h2>
            <p>
              We may update these Terms periodically. Continued use of CupidX after changes are posted constitutes your acceptance of the revised Terms. For questions or support inquiries, contact us at <strong>support@cupidxchat.in</strong>.
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
