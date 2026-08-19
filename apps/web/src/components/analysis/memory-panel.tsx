'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ContactMemory, MEMORY_SECTIONS } from '@/lib/types';
import { contactsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface MemoryPanelProps {
  contactId: string;
  contactName: string;
  memory: ContactMemory | null | undefined;
  onChange?: (m: ContactMemory) => void;
  /** Collapsed by default on the analysis page, expanded on the contact page. */
  defaultOpen?: boolean;
  editable?: boolean;
}

const EMPTY: ContactMemory = {
  facts: [], interests: [], insideJokes: [], openThreads: [], avoid: [],
};

export function MemoryPanel({
  contactId, contactName, memory, onChange, defaultOpen = false, editable = true,
}: MemoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [local, setLocal] = useState<ContactMemory>({ ...EMPTY, ...(memory ?? {}) });
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const total = Object.values(local).reduce((n, arr) => n + arr.length, 0);

  const persist = async (next: ContactMemory) => {
    setLocal(next);
    onChange?.(next);
    setSaving(true);
    try {
      await contactsApi.updateMemory(contactId, next as unknown as Record<string, string[]>);
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (key: keyof ContactMemory, idx: number) =>
    persist({ ...local, [key]: local[key].filter((_, i) => i !== idx) });

  const addItem = (key: keyof ContactMemory) => {
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
              {total === 0 && (
                <p className="text-white/40 text-xs py-2">
                  Nothing yet. Every scan of this chat adds what it picks up — inside
                  jokes, things she mentions, threads left hanging.
                </p>
              )}

              {MEMORY_SECTIONS.map(({ key, label, emoji }) => {
                const items = local[key as keyof ContactMemory];
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
                            key === 'avoid'
                              ? 'bg-rose-500/10 text-rose-200/85'
                              : 'bg-white/5 text-white/75',
                          )}
                        >
                          <span className="flex-1">{item}</span>
                          {editable && (
                            <button
                              onClick={() => removeItem(key as keyof ContactMemory, idx)}
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
                        onBlur={() => addItem(key as keyof ContactMemory)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addItem(key as keyof ContactMemory);
                          if (e.key === 'Escape') { setAdding(null); setDraft(''); }
                        }}
                        placeholder={`Add to ${label.toLowerCase()}...`}
                        className="bg-surface-700 border border-brand-500/40 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}

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
