'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';

export default function RootPage() {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const initSession = useAuthStore((s) => s.initSession);
  const routed = useRef(false);

  useEffect(() => {
    // Wait for persisted state, otherwise a returning user looks brand new
    // here and gets issued a second anonymous account.
    if (!hydrated || routed.current) return;
    routed.current = true;

    const go = () => {
      const { onboardingComplete } = useAuthStore.getState();
      router.replace(onboardingComplete ? '/home' : '/onboarding');
    };

    if (token) go();
    else initSession().then(go).catch(() => { routed.current = false; });
  }, [hydrated, token]);

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
