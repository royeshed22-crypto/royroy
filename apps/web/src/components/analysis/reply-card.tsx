'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { SuggestedReply } from '@/lib/types';
import { analysesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const TONE_ACCENT = {
  PLAYFUL: { dot: 'bg-yellow-400', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  DIRECT:  { dot: 'bg-blue-400',   text: 'text-blue-400',   border: 'border-blue-500/20' },
  WARM:    { dot: 'bg-pink-400',   text: 'text-pink-400',   border: 'border-pink-500/20' },
};

const INTENSITY_LABEL: Record<number, string> = {
  1: 'Subtle',
  2: 'Clear',
  3: 'Full send',
};

const RISK_COLORS = {
  LOW:    'text-emerald-400/70',
  MEDIUM: 'text-yellow-400/70',
  HIGH:   'text-rose-400/70',
};

interface ReplyCardProps {
  reply: SuggestedReply;
}

export function ReplyCard({ reply }: ReplyCardProps) {
  const [copied, setCopied] = useState(false);
  const accent = TONE_ACCENT[reply.tone];
  const level = Math.min(3, Math.max(1, reply.intensity ?? 2));

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reply.text);
    setCopied(true);
    toast.success('Copied');
    try { await analysesApi.markCopied(reply.id); } catch { /* silent */ }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('glass-card border p-4 flex flex-col gap-3', accent.border)}>
      <div className="flex items-center justify-between">
        {/* Intensity meter */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 w-4 rounded-full transition-colors',
                  i <= level ? accent.dot : 'bg-white/15',
                )}
              />
            ))}
          </div>
          <span className={cn('text-[11px] font-medium', accent.text)}>
            {INTENSITY_LABEL[level]}
          </span>
        </div>

        <span className={cn('text-[10px] font-medium', RISK_COLORS[reply.riskLevel])}>
          {reply.riskLevel}
        </span>
      </div>

      <p className="text-white text-sm leading-relaxed">{reply.text}</p>

      {reply.explanation && (
        <p className="text-white/40 text-xs">{reply.explanation}</p>
      )}

      <button
        onClick={handleCopy}
        className={cn(
          'flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95',
          copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white hover:bg-white/20',
        )}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
