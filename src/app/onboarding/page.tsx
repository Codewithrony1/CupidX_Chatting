'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import FloatingHearts from '@/components/FloatingHearts';

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0d0014] flex items-center justify-center p-4">
      <FloatingHearts />
      <div className="text-center space-y-3 z-10">
        <Loader2 className="w-10 h-10 text-pink-500 animate-spin mx-auto" />
        <p className="text-xs font-bold text-pink-300">Redirecting to Dashboard...</p>
      </div>
    </div>
  );
}
