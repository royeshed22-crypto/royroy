'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, Zap, Target, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { SuggestedReply, ReplyTone } from '@/lib/types';
import { analysesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

const TONE_META = {
  PLAYFUL: {
    label: 'Playful',
    icon: Zap,
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
    fill: 'bg-yellow-400',
    glow: 'bg-yellow-500/10',
    levels: ['Dry', 'Funny', 'Bold'],
  },
  DIRECT: {
    label: 'Direct',
    icon: Target,
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    fill: 'bg-blue-400',
    glow: 'bg-blue-500/10',
    levels: ['Soft', 'Clear', 'All in'],
  },
  WARM: {
    label: 'Warm',
    icon: Heart,
    text: 'text-pink-400',
    border: 'border-pink-500/20',
    fill: 'bg-pink-400',
    glow: 'bg-pink-500/10',
    levels: ['Subtle', 'Warm', 'Open'],
  },
};

const RISK_STYLE = {
  LOW: 'text-emerald-400/70',
  MEDIUM: 'text-yellow-400/70',
  HIGH: 'text-rose-400/70',
};

interface ReplyToneCardProps {
  tone: ReplyTone;
  replies: SuggestedReply[];
}

export function ReplyToneCard({ tone, replies }: ReplyToneCardProps) {
  const meta = TONE_META[tone];
  const Icon = meta.icon;

  // Default to the middle level when it exists, otherwise the first we have.
  const available = [1, 2, 3].filter((lvl) => replies.some((r) => (r.intensity ?? 2) === lvl));
  const [level, setLevel] = useState(available.includes(2) ? 2 : available[0] ?? 1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reply = replies.find((r) => (r.intensity ?? 2) === level) ?? replies[0];
  if (!reply) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reply.text);
    setCopiedId(reply.id);
    toast.success('Copied');
    try { await analysesApi.markCopied(reply.id); } catch { /* silent */ }
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copied = copiedId === reply.id;

  return (
    <div className={cn('glass-card border p-4 flex flex-col gap-3.5', meta.border)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-sm font-semibold', meta.text)}>
          <Icon size={15} />
          {meta.label}
        </div>
        <span className={cn('text-[10px] font-medium tracking-wide', RISK_STYLE[reply.riskLevel])}>
          {reply.riskLevel} RISK
        </span>
      </div>

      {/* Intensity selector */}
      <div className="relative flex rounded-xl bg-black/25 p-1">
        {[1, 2, 3].map((lvl) => {
          const isActive = lvl === level;
          const exists = available.includes(lvl);
          return (
            <button
              key={lvl}
              onClick={() => exists && setLevel(lvl)}
              disabled={!exists}
              className={cn(
                'relative flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors duration-200 z-10 disabled:opacity-25',
                isActive ? 'text-surface-900' : 'text-white/50 hover:text-white/80',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={`intensity-${tone}`}
                  className={cn('absolute inset-0 rounded-lg -z-10', meta.fill)}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              {meta.levels[lvl - 1]}
            </button>
          );
        })}
      </div>

      {/* Reply text */}
      <div className={cn('rounded-xl p-3 min-h-[72px] flex items-center', meta.glow)}>
        <AnimatePresence mode="wait">
          <motion.p
            key={reply.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="text-white text-sm leading-relaxed"
          >
            {reply.text}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Why it works */}
      <AnimatePresence mode="wait">
        <motion.p
          key={`${reply.id}-exp`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="text-white/40 text-xs"
        >
          {reply.explanation}
        </motion.p>
      </AnimatePresence>

      <button
        onClick={handleCopy}
        className={cn(
          'flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-95',
          copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white hover:bg-white/20',
        )}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
