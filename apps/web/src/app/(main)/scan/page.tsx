'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, Check } from 'lucide-react';
import { Dropzone } from '@/components/upload/dropzone';
import { uploadsApi, analysesApi, contactsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'uploading' | 'queuing' | 'analyzing';

const PHASE_TEXT: Record<Exclude<Phase, 'idle'>, string> = {
  uploading: 'Uploading screenshots',
  queuing: 'Sending to the model',
  analyzing: 'Reading the conversation',
};

const PHASE_ORDER: Array<Exclude<Phase, 'idle'>> = ['uploading', 'queuing', 'analyzing'];

export default function ScanPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [contactName, setContactName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  // Guards against double-submit. State updates are async, so a fast double
  // click can fire handleScan twice before the button re-renders as disabled.
  const lock = useRef(false);
  useEffect(() => () => { lock.current = false; }, []);

  const busy = phase !== 'idle';

  const handleScan = async () => {
    if (lock.current) return;
    if (files.length === 0) { toast.error('Add at least one screenshot'); return; }

    lock.current = true;
    setPhase('uploading');
    setProgress(0);

    try {
      const uploads = await uploadsApi.upload(files, setProgress);
      const uploadIds = uploads.map((u: any) => u.id);

      setPhase('queuing');
      let contactId: string | undefined;
      if (contactName.trim()) {
        const contact = await contactsApi.create({ displayName: contactName.trim() });
        contactId = contact.id;
      }

      const analysis = await analysesApi.create(uploadIds, contactId);

      setPhase('analyzing');
      router.push(`/analyses/${analysis.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Upload failed. Try again.');
      setPhase('idle');
      setProgress(0);
      lock.current = false;
    }
    // On success we leave the lock engaged — the route is changing and the
    // button should stay inert until this screen unmounts.
  };

  const activeIndex = phase === 'idle' ? -1 : PHASE_ORDER.indexOf(phase);

  return (
    <div className="flex flex-col gap-6 p-5 pt-12 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white">Scan a conversation</h1>
        <p className="text-white/50 text-sm mt-1">Upload 1–10 screenshots to analyze</p>
      </div>

      <div className={cn('transition-opacity duration-300', busy && 'opacity-40 pointer-events-none')}>
        <Dropzone files={files} onChange={setFiles} />
      </div>

      <div className={cn('flex flex-col gap-2 transition-opacity duration-300', busy && 'opacity-40 pointer-events-none')}>
        <label className="text-sm text-white/60 font-medium">Who is this? (optional)</label>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="e.g. Alex from Tinder"
          className="input-base"
          maxLength={50}
          disabled={busy}
        />
      </div>

      {/* Progress panel */}
      <AnimatePresence>
        {busy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card p-4 flex flex-col gap-3 overflow-hidden"
          >
            {PHASE_ORDER.map((p, i) => {
              const done = i < activeIndex;
              const active = i === activeIndex;

              return (
                <div key={p} className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300',
                      done ? 'bg-emerald-500/20' : active ? 'bg-brand-500/20' : 'bg-white/5',
                    )}
                  >
                    {done ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : active ? (
                      <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                    )}
                  </div>

                  <span
                    className={cn(
                      'text-sm transition-colors duration-300',
                      done ? 'text-white/40' : active ? 'text-white font-medium' : 'text-white/25',
                    )}
                  >
                    {PHASE_TEXT[p]}
                  </span>

                  {active && p === 'uploading' && (
                    <span className="ml-auto text-xs text-white/40 tabular-nums">{progress}%</span>
                  )}
                </div>
              );
            })}

            {/* Bar tracks upload precisely, then runs indeterminate */}
            <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1">
              {phase === 'uploading' ? (
                <div
                  className="h-full rounded-full bg-brand-gradient transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              ) : (
                <motion.div
                  className="h-full w-1/3 rounded-full bg-brand-gradient"
                  animate={{ x: ['-100%', '300%'] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleScan}
        disabled={files.length === 0 || busy}
        className={cn(
          'relative w-full py-4 rounded-2xl font-semibold text-lg overflow-hidden transition-all duration-200',
          'disabled:opacity-50 disabled:pointer-events-none',
          busy ? 'bg-surface-700 text-white/70' : 'brand-btn active:scale-95',
        )}
      >
        {/* Shimmer sweep while working */}
        {busy && (
          <motion.span
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
          />
        )}

        <span className="relative flex items-center justify-center gap-2">
          {busy ? (
            <>
              <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              {phase === 'uploading' ? `Uploading ${progress}%` : 'Analyzing'}
            </>
          ) : (
            <>
              <ScanLine size={18} />
              {files.length > 0
                ? `Analyze ${files.length} screenshot${files.length > 1 ? 's' : ''}`
                : 'Analyze'}
            </>
          )}
        </span>
      </button>
    </div>
  );
}
