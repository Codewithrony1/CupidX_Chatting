'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Heart, Shield, User, MessageCircle, Lock, ArrowRight, FastForward, CheckCircle2 } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

const Canvas3D = dynamic(() => import('@/components/Canvas3D'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#120019] -z-10 animate-pulse" />,
});

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-x-hidden selection:bg-pink-500 selection:text-white bg-[#0d0014]">
      {/* 3D Animated Background */}
      <Canvas3D />
      <FloatingHearts />

      {/* Header */}
      <header className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 flex justify-between items-center z-10">
        <Link href="/" className="flex items-center space-x-2 sm:space-x-2.5 group shrink-0">
          <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-pink-600 via-rose-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-pink-500/40 group-hover:scale-110 transition-transform">
            <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white animate-pulse" />
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-wider bg-gradient-to-r from-white via-pink-100 to-rose-300 bg-clip-text text-transparent">
            Cupidx
          </span>
        </Link>
        
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <Link
            href="/login"
            className="px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs font-bold text-pink-200 hover:text-white transition-all bg-white/5 hover:bg-white/10 border border-pink-500/30 backdrop-blur-md whitespace-nowrap"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs font-bold bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white shadow-lg shadow-pink-500/30 flex items-center gap-1 sm:gap-1.5 transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
          >
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Join Now</span>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-grow flex flex-col items-center justify-center px-4 sm:px-6 py-10 text-center max-w-4xl mx-auto z-10 relative space-y-12">
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="space-y-6"
        >
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 px-5 py-2 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-400/40 text-pink-300 text-xs font-extrabold uppercase tracking-widest shadow-lg shadow-pink-500/20 backdrop-blur-md">
            <Lock className="w-3.5 h-3.5 text-pink-400" />
            <span>Privacy-First Ephemeral Messaging</span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-none text-white drop-shadow-2xl">
            Meet. Chat.{' '}
            <span className="bg-gradient-to-r from-pink-400 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent text-glow-pink">
              Move on.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-pink-100/90 max-w-xl mx-auto font-normal leading-relaxed">
            Private, simple 1-to-1 conversations without unnecessary chat history. When you press <span className="font-bold text-white">NEXT</span>, messages are permanently erased.
          </p>

          {/* CTAs */}
          <div className="flex justify-center pt-4 w-full max-w-sm mx-auto">
            <Link
              href="/chat/random"
              className="w-full py-5 rounded-3xl font-black bg-gradient-to-r from-pink-600 via-rose-500 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white shadow-2xl shadow-pink-500/50 hover:scale-105 active:scale-95 transition-all text-xl flex items-center justify-center space-x-3 border border-pink-400/40 glow-pink-lg group cursor-pointer"
            >
              <Heart className="w-7 h-7 fill-white animate-bounce" />
              <span>START CHATTING</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </motion.div>

        {/* How It Works Section */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="w-full space-y-6 text-left"
        >
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-white">How It Works</h2>
            <p className="text-xs text-pink-200/70">Connect, talk, and move forward in 4 simple steps</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-romantic rounded-3xl p-5 space-y-2 border border-pink-500/20">
              <span className="w-8 h-8 rounded-2xl bg-pink-500/20 text-pink-400 font-black text-sm flex items-center justify-center border border-pink-500/30">1</span>
              <h4 className="text-sm font-bold text-white">Create Account</h4>
              <p className="text-pink-200/70 text-xs leading-relaxed">Sign up and pick a unique @username for your profile.</p>
            </div>

            <div className="glass-romantic rounded-3xl p-5 space-y-2 border border-pink-500/20">
              <span className="w-8 h-8 rounded-2xl bg-pink-500/20 text-pink-400 font-black text-sm flex items-center justify-center border border-pink-500/30">2</span>
              <h4 className="text-sm font-bold text-white">Instant Match</h4>
              <p className="text-pink-200/70 text-xs leading-relaxed">Click START CHATTING to instantly join the romantic match queue.</p>
            </div>

            <div className="glass-romantic rounded-3xl p-5 space-y-2 border border-pink-500/20">
              <span className="w-8 h-8 rounded-2xl bg-pink-500/20 text-pink-400 font-black text-sm flex items-center justify-center border border-pink-500/30">3</span>
              <h4 className="text-sm font-bold text-white">Chat Instantly</h4>
              <p className="text-pink-200/70 text-xs leading-relaxed">Exchange real-time text messages and emojis safely.</p>
            </div>

            <div className="glass-romantic rounded-3xl p-5 space-y-2 border border-pink-500/20">
              <span className="w-8 h-8 rounded-2xl bg-pink-500/20 text-pink-400 font-black text-sm flex items-center justify-center border border-pink-500/30">4</span>
              <h4 className="text-sm font-bold text-white">Press NEXT</h4>
              <p className="text-pink-200/70 text-xs leading-relaxed">When done, press NEXT. All chat messages are erased on the server.</p>
            </div>
          </div>
        </motion.div>

        {/* Privacy Highlight Banner */}
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="glass-romantic rounded-3xl p-6 sm:p-8 w-full border border-pink-500/30 text-left space-y-3"
        >
          <div className="flex items-center space-x-2 text-pink-400 font-bold text-sm">
            <Shield className="w-5 h-5" />
            <span>Complete Data Privacy Policy</span>
          </div>
          <p className="text-xs sm:text-sm text-pink-100/90 leading-relaxed">
            Cupidx is built around temporary 1-to-1 conversations. We do not keep permanent chat logs or store message contents in database archives after a chat is ended or expired.
          </p>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 border-t border-pink-500/15 flex flex-col sm:flex-row justify-between items-center gap-3 z-10 bg-slate-950/60 backdrop-blur-md">
        <span className="text-xs text-pink-300/60 font-medium">
          © {new Date().getFullYear()} Cupidx. Connect. Chat. Move on.
        </span>
        <div className="flex items-center space-x-5 text-xs text-pink-200/80 font-semibold">
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <Link href="/settings" className="hover:text-white transition-colors">Settings</Link>
        </div>
      </footer>
    </div>
  );
}
