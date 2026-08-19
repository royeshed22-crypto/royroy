'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { useAuthStore } from '@/store/auth.store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  useEffect(() => {
    // Before hydration `token` is always null, so acting on it here would
    // redirect a signed-in user to "/" on every mount.
    if (!hydrated) return;

    if (!token) { router.replace('/'); return; }
    if (!onboardingComplete) { router.replace('/onboarding'); return; }
    fetchUser();
  }, [hydrated, token, onboardingComplete]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center text-xl font-black text-white animate-pulse-slow">
          D
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
