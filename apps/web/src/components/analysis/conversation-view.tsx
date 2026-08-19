'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ChevronDown, Info } from 'lucide-react';
import { AnalysisMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

const SENTIMENT_DOT: Record<string, string> = {
  positive: 'bg-emerald-400',
  neutral: 'bg-white/25',
  negative: 'bg-rose-400',
};

interface ConversationViewProps {
  messages: AnalysisMessage[];
}

export function ConversationView({ messages }: ConversationViewProps) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  if (!messages?.length) return null;

  const ordered = [...messages].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-brand-400" />
          <span className="text-white font-semibold text-sm">The conversation</span>
          <span className="text-white/30 text-xs">{ordered.length} messages</span>
        </div>
        <ChevronDown
          size={16}
          className={cn('text-white/40 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex flex-col gap-2 max-h-[26rem] overflow-y-auto">
              {ordered.map((m) => {
                const isSelf = m.speaker === 'SELF';
                const isOpen = selected === m.id;
                const hasNote = Boolean(m.explanation);

                return (
                  <div
                    key={m.id}
                    className={cn('flex flex-col gap-1', isSelf ? 'items-end' : 'items-start')}
                  >
                    <button
                      onClick={() => hasNote && setSelected(isOpen ? null : m.id)}
                      className={cn(
                        'max-w-[85%] text-left rounded-2xl px-3.5 py-2.5 transition-all duration-150',
                        isSelf
                          ? 'bg-brand-600/85 text-white rounded-br-md'
                          : 'bg-surface-600 text-white rounded-bl-md',
                        hasNote && 'cursor-pointer hover:brightness-110',
                        isOpen && 'ring-1 ring-white/25',
                      )}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                        {m.text}
                      </p>
                    </button>

                    <div className={cn('flex items-center gap-1.5 px-1', isSelf && 'flex-row-reverse')}>
                      {m.sentiment && (
                        <span className={cn('w-1.5 h-1.5 rounded-full', SENTIMENT_DOT[m.sentiment] ?? SENTIMENT_DOT.neutral)} />
                      )}
                      {typeof m.score === 'number' && (
                        <span className="text-[10px] text-white/30 tabular-nums">{m.score}</span>
                      )}
                      {hasNote && !isOpen && <Info size={9} className="text-white/25" />}
                    </div>

                    <AnimatePresence>
                      {isOpen && m.explanation && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className={cn(
                            'text-[11px] text-white/50 max-w-[85%] px-2 pb-1',
                            isSelf ? 'text-right' : 'text-left',
                          )}
                        >
                          {m.explanation}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            <p className="text-white/20 text-[10px] text-center pb-3 px-4">
              Read from your screenshots. Tap a message for the read on it.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
