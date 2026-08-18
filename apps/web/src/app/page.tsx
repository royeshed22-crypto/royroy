'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export default function RootPage() {
  const router = useRouter();
  const { token, onboardingComplete, initSession } = useAuthStore();

  useEffect(() => {
    if (!token) {
      initSession().then(() => {
        const { onboardingComplete } = useAuthStore.getState();
        router.replace(onboardingComplete ? '/home' : '/onboarding');
      });
    } else {
      router.replace(onboardingComplete ? '/home' : '/onboarding');
    }
  }, []);

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-brand-gradient flex items-center justify-center text-3xl font-black text-white animate-pulse-slow">
          D
        </div>
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    </div>
  );
}
