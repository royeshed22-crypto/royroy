'use client';
import { useState } from 'react';
import { Copy, Check, Zap, Target, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { SuggestedReply } from '@/lib/types';
import { analysesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const TONE_CONFIG = {
  PLAYFUL: { icon: Zap, label: 'Playful', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  DIRECT:  { icon: Target, label: 'Direct',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  WARM:    { icon: Heart,  label: 'Warm',    color: 'text-pink-400',   bg: 'bg-pink-500/10 border-pink-500/20' },
};

const RISK_COLORS = {
  LOW:    'bg-emerald-500/20 text-emerald-400',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400',
  HIGH:   'bg-rose-500/20 text-rose-400',
};

interface ReplyCardProps {
  reply: SuggestedReply;
}

export function ReplyCard({ reply }: ReplyCardProps) {
  const [copied, setCopied] = useState(false);
  const cfg = TONE_CONFIG[reply.tone];
  const Icon = cfg.icon;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reply.text);
    setCopied(true);
    toast.success('Copied to clipboard');
    try { await analysesApi.markCopied(reply.id); } catch { /* silent */ }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('glass-card border p-4 flex flex-col gap-3', cfg.bg)}>
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-sm font-semibold', cfg.color)}>
          <Icon size={14} />
          {cfg.label}
        </div>
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', RISK_COLORS[reply.riskLevel])}>
          {reply.riskLevel} RISK
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
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
