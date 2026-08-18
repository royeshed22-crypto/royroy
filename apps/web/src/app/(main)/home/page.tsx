'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScanLine, TrendingUp, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/store/auth.store';
import { usersApi, analysesApi } from '@/lib/api';
import { UserProgress, Analysis, getRank } from '@/lib/types';

export default function HomePage() {
  const { user } = useAuthStore();
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [recent, setRecent] = useState<Analysis[]>([]);

  useEffect(() => {
    usersApi.getProgress().then(setProgress).catch(() => {});
    analysesApi.list().then((list) => setRecent(list.slice(0, 3))).catch(() => {});
  }, []);

  const rank = getRank(user?.eloScore ?? 1000);

  return (
    <div className="flex flex-col gap-6 p-5 pt-12 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/50 text-sm">Good to see you</p>
          <h1 className="text-2xl font-black text-white">{user?.displayName ?? 'Coach'} {rank.emoji}</h1>
        </div>
        <div className="glass rounded-2xl px-3 py-2 flex items-center gap-2">
          <Flame size={16} className="text-orange-400" />
          <span className="text-white font-bold text-sm">{user?.streakDays ?? 0}</span>
        </div>
      </div>

      {/* ELO Card */}
      <Card className="bg-brand-gradient border-0 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/70 text-sm font-medium">Your rank</p>
            <h2 className="text-3xl font-black text-white mt-1">{rank.label}</h2>
            <p className="text-white/60 text-sm mt-1">{user?.eloScore ?? 1000} ELO</p>
          </div>
          <TrendingUp size={32} className="text-white/50 mt-1" />
        </div>
        {progress && (
          <div className="mt-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-700"
              style={{ width: `${Math.min(((user?.eloScore ?? 1000) % 150) / 150 * 100, 100)}%` }}
            />
          </div>
        )}
      </Card>

      {/* CTA */}
      <Link href="/scan">
        <Button size="lg" className="gap-3 py-5">
          <ScanLine size={20} />
          Analyze a conversation
        </Button>
      </Link>

      {/* Recent */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-white font-semibold">Recent analyses</h3>
          {recent.map((a) => (
            <Link key={a.id} href={`/analyses/${a.id}`}>
              <Card className="flex items-center justify-between p-4 active:scale-[0.98] transition-transform">
                <div>
                  <p className="text-white font-medium text-sm">{a.contact?.displayName ?? 'Unknown'}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {a.overallScore != null && (
                  <span
                    className={`text-xl font-black ${a.overallScore >= 70 ? 'text-emerald-400' : a.overallScore >= 40 ? 'text-yellow-400' : 'text-rose-400'}`}
                  >
                    {a.overallScore}
                  </span>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {recent.length === 0 && progress?.totalAnalyses === 0 && (
        <Card className="text-center py-10 flex flex-col items-center gap-3">
          <span className="text-5xl">📸</span>
          <p className="text-white/60 text-sm">No analyses yet. Upload your first screenshot!</p>
        </Card>
      )}
    </div>
  );
}
