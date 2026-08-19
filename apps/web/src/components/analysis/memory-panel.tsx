'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ContactMemory, MEMORY_SECTIONS, MemoryListKey } from '@/lib/types';
import { contactsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MemoryPanelProps {
  contactId: string;
  contactName: string;
  memory: ContactMemory | null | undefined;
  onChange?: (m: ContactMemory) => void;
  defaultOpen?: boolean;
  editable?: boolean;
}

const EMPTY: ContactMemory = {
  summary: '',
  facts: [],
  inferences: [],
  events: [],
  patterns: { them: [], me: [] },
  insideJokes: [],
  interests: [],
  plans: [],
  unresolvedTopics: [],
  boundaries: [],
  currentDynamic: '',
};

/** Confidence rendered as words; a bare 0.55 means nothing to a reader. */
function confidenceLabel(c: number): { text: string; className: string } {
  if (c >= 0.85) return { text: 'likely', className: 'text-emerald-400/70' };
  if (c >= 0.6) return { text: 'maybe', className: 'text-yellow-400/70' };
  return { text: 'a guess', className: 'text-white/35' };
}

export function MemoryPanel({
  contactId, contactName, memory, onChange, defaultOpen = false, editable = true,
}: MemoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  // Spread over EMPTY so a memory saved before a field existed still renders.
  const [local, setLocal] = useState<ContactMemory>({
    ...EMPTY,
    ...(memory ?? {}),
    patterns: { ...EMPTY.patterns, ...(memory?.patterns ?? {}) },
  });
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const total =
    local.facts.length + local.inferences.length + local.events.length +
    MEMORY_SECTIONS.reduce((n, s) => n + local[s.key].length, 0);

  const persist = async (next: ContactMemory) => {
    setLocal(next);
    onChange?.(next);
    setSaving(true);
    try {
      // Only the plain-string lists are editable here; facts and inferences are
      // model-owned and carry confidence the UI has no way to re-derive.
      const payload = Object.fromEntries(
        MEMORY_SECTIONS.map((s) => [s.key, next[s.key]]),
      ) as Record<string, string[]>;
      await contactsApi.updateMemory(contactId, payload);
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (key: MemoryListKey, idx: number) =>
    persist({ ...local, [key]: local[key].filter((_, i) => i !== idx) });

  const addItem = (key: MemoryListKey) => {
    const value = draft.trim();
    if (!value) { setAdding(null); return; }
    persist({ ...local, [key]: [...local[key], value] });
    setDraft('');
    setAdding(null);
  };

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain size={15} className="text-brand-400" />
          <span className="text-white font-semibold text-sm">
            What DUGRIZZ knows about {contactName}
          </span>
          {total > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300">
              {total}
            </span>
          )}
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
            <div className="px-4 pb-4 flex flex-col gap-4">
              {total === 0 && !local.summary && (
                <p className="text-white/40 text-xs py-2">
                  Nothing yet. Every scan adds what it picks up — inside jokes,
                  things she mentions, threads left hanging.
                </p>
              )}

              {local.summary && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
                    📖 The story so far
                  </span>
                  <p className="text-white/75 text-xs leading-relaxed">{local.summary}</p>
                </div>
              )}

              {local.currentDynamic && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
                    🌡️ Right now
                  </span>
                  <p className="text-white/75 text-xs leading-relaxed">{local.currentDynamic}</p>
                </div>
              )}

              {/* Facts are things she said. Kept visually distinct from readings. */}
              {local.facts.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
                    📌 She said
                  </span>
                  <div className="flex flex-col gap-1">
                    {local.facts.map((f, i) => (
                      <div
                        key={`fact-${i}`}
                        className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs bg-white/5 text-white/75"
                      >
                        <span className="flex-1 leading-relaxed">{f.text}</span>
                        {f.confidence < 1 && (
                          <span className="text-[10px] text-white/30 shrink-0 mt-0.5">
                            {Math.round(f.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Readings, labelled as guesses so they are not mistaken for fact. */}
              {local.inferences.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
                    🤔 Reading between the lines
                  </span>
                  <div className="flex flex-col gap-1">
                    {local.inferences.map((inf, i) => {
                      const c = confidenceLabel(inf.confidence);
                      return (
                        <div
                          key={`inf-${i}`}
                          className="flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 bg-white/5"
                        >
                          <div className="flex items-start gap-2">
                            <span className="flex-1 text-xs text-white/70 leading-relaxed">
                              {inf.text}
                            </span>
                            <span className={cn('text-[10px] shrink-0 mt-0.5', c.className)}>
                              {c.text}
                            </span>
                          </div>
                          {inf.evidence?.length > 0 && (
                            <span className="text-[10px] text-white/25 leading-relaxed">
                              from: {inf.evidence.join(' · ')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-white/25 text-[10px]">
                    Guesses, not facts. Treat them lightly.
                  </p>
                </div>
              )}

              {local.events.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
                    📍 What happened
                  </span>
                  <div className="flex flex-col gap-1">
                    {local.events.map((e, i) => (
                      <div
                        key={`ev-${i}`}
                        className="rounded-lg px-2.5 py-1.5 text-xs bg-white/5 text-white/75 leading-relaxed"
                      >
                        {e.event}
                        {e.when && <span className="text-white/35"> · {e.when}</span>}
                        {e.result && <span className="text-white/45"> → {e.result}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {MEMORY_SECTIONS.map(({ key, label, emoji }) => {
                const items = local[key];
                const isAdding = adding === key;
                if (!items.length && !isAdding && !editable) return null;

                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
                        {emoji} {label}
                      </span>
                      {editable && !isAdding && (
                        <button
                          onClick={() => { setAdding(key); setDraft(''); }}
                          className="text-white/30 hover:text-white/70 transition-colors"
                        >
                          <Plus size={13} />
                        </button>
                      )}
                    </div>

                    {items.length === 0 && !isAdding && (
                      <span className="text-white/20 text-xs">—</span>
                    )}

                    <div className="flex flex-col gap-1">
                      {items.map((item, idx) => (
                        <div
                          key={`${key}-${idx}`}
                          className={cn(
                            'group flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed',
                            key === 'boundaries'
                              ? 'bg-rose-500/10 text-rose-200/85'
                              : 'bg-white/5 text-white/75',
                          )}
                        >
                          <span className="flex-1">{item}</span>
                          {editable && (
                            <button
                              onClick={() => removeItem(key, idx)}
                              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-rose-400 transition-all shrink-0 mt-0.5"
                            >
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {isAdding && (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => addItem(key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addItem(key);
                          if (e.key === 'Escape') { setAdding(null); setDraft(''); }
                        }}
                        placeholder={`Add to ${label.toLowerCase()}...`}
                        className="bg-surface-700 border border-brand-500/40 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}

              {(local.patterns.them.length > 0 || local.patterns.me.length > 0) && (
                <div className="flex flex-col gap-2">
                  <span className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
                    💭 How you two text
                  </span>
                  {([['them', contactName], ['me', 'You']] as const).map(([side, who]) =>
                    local.patterns[side].length ? (
                      <div key={side} className="flex flex-col gap-0.5">
                        <span className="text-white/30 text-[10px]">{who}</span>
                        {local.patterns[side].map((p, i) => (
                          <span key={i} className="text-white/65 text-xs leading-relaxed">• {p}</span>
                        ))}
                      </div>
                    ) : null,
                  )}
                </div>
              )}

              {editable && (
                <p className="text-white/25 text-[10px] pt-1">
                  This feeds every future reply. Delete anything that's wrong.
                  {saving && <span className="ml-1 text-brand-400">Saving…</span>}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
