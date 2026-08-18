'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { useAuthStore } from '@/store/auth.store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, onboardingComplete, fetchUser } = useAuthStore();

  useEffect(() => {
    if (!token) { router.replace('/'); return; }
    if (!onboardingComplete) { router.replace('/onboarding'); return; }
    fetchUser();
  }, [token, onboardingComplete]);

  return (
    <div className="min-h-screen pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
