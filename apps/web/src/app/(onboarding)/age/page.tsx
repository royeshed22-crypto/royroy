'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function AgePage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="text-6xl">🔞</div>
        <h1 className="text-3xl font-black text-white">Are you 18 or older?</h1>
        <p className="text-white/50 text-base leading-relaxed max-w-xs">
          DUGRIZZ is intended for adults only. Romantic content may be discussed.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <Button size="lg" onClick={() => router.push('/consent')}>
          Yes, I'm 18+
        </Button>
        <Button size="lg" variant="outline" onClick={() => router.back()}>
          No, go back
        </Button>
      </div>
    </div>
  );
}
