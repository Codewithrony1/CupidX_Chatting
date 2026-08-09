'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import FloatingHearts from '@/components/FloatingHearts';

export default function SSOCallbackPage() {
  return (
    <div className="min-h-[100dvh] bg-[#0d0014] text-white flex items-center justify-center relative overflow-hidden">
      <FloatingHearts />
      <div className="text-center space-y-3 z-10">
        <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-pink-300">Completing sign in with Google...</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
