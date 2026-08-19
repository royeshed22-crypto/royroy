'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanLine, Check, Sparkles, History } from 'lucide-react';
import { Dropzone } from '@/components/upload/dropzone';
import { uploadsApi, analysesApi, contactsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'uploading' | 'queuing' | 'analyzing';

const PHASE_TEXT: Record<Exclude<Phase, 'idle'>, string> = {
  uploading: 'Uploading screenshots',
  queuing: 'Sending to the model',
  analyzing: 'Reading the conversation',
};

const IMPORT_PHASE_TEXT: Record<Exclude<Phase, 'idle'>, string> = {
  uploading: 'Uploading screenshots',
  queuing: 'Queueing the import',
  analyzing: 'Reading and merging messages',
};

const PHASE_ORDER: Array<Exclude<Phase, 'idle'>> = ['uploading', 'queuing', 'analyzing'];

export default function ScanPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [contactName, setContactName] = useState('');
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<'scan' | 'import'>('scan');
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

      const analysis = await analysesApi.create(
        uploadIds,
        contactId,
        context.trim() || undefined,
        mode === 'import',
      );

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
        <h1 className="text-2xl font-black text-white">
          {mode === 'scan' ? 'Scan a conversation' : 'Import a conversation'}
        </h1>
        <p className="text-white/50 text-sm mt-1">
          {mode === 'scan'
            ? 'Upload screenshots and get replies'
            : 'Backfill an existing chat so DUGRIZZ knows the whole story'}
        </p>
      </div>

      {/* Import exists because most people start mid-relationship. Backfilling
          once means every later scan reads against real history. */}
      <div className={cn('relative flex rounded-xl bg-black/25 p-1', busy && 'opacity-40 pointer-events-none')}>
        {(['scan', 'import'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={busy}
            className={cn(
              'relative flex-1 py-2 text-sm font-medium rounded-lg transition-colors duration-200 z-10',
              mode === m ? 'text-surface-900' : 'text-white/50 hover:text-white/80',
            )}
          >
            {mode === m && (
              <motion.span
                layoutId="scan-mode"
                className="absolute inset-0 rounded-lg bg-white -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            {m === 'scan' ? 'New messages' : 'Import history'}
          </button>
        ))}
      </div>

      {mode === 'import' && (
        <div className="glass-card border-brand-500/20 bg-brand-500/5 p-3.5 flex gap-2.5">
          <History size={15} className="text-brand-400 mt-0.5 shrink-0" />
          <div className="text-xs text-white/60 leading-relaxed">
            Upload as much of the chat as you have, oldest first. Overlapping
            screenshots are fine — repeated messages get merged automatically.
            <span className="block mt-1 text-white/40">
              This only saves the history. No replies are generated.
            </span>
          </div>
        </div>
      )}

      <div className={cn('transition-opacity duration-300', busy && 'opacity-40 pointer-events-none')}>
        <Dropzone files={files} onChange={setFiles} maxFiles={mode === 'import' ? 60 : 10} />
      </div>

      <div className={cn('flex flex-col gap-5 transition-opacity duration-300', busy && 'opacity-40 pointer-events-none')}>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-white/60 font-medium">Who is this? (optional)</label>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Leave blank and we'll read it off the chat"
            className="input-base"
            maxLength={50}
            disabled={busy}
          />
        </div>

        {/* The screenshots can't show a voice note or what a photo contained,
            and that context changes the read more than anything else. */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-white/60 font-medium">
            Anything the screenshots don't show?
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={
              'She sent a selfie at the beach\n' +
              'Voice note was her laughing, sounded into it\n' +
              'We matched 3 weeks ago, met once for coffee'
            }
            rows={4}
            maxLength={4000}
            disabled={busy}
            className="input-base resize-none leading-relaxed text-sm"
          />
          <div className="flex items-start gap-1.5">
            <Sparkles size={12} className="text-brand-400 mt-0.5 shrink-0" />
            <p className="text-white/35 text-xs leading-relaxed">
              Photos, voice notes, history between you. This lands harder than the
              messages themselves.
            </p>
          </div>
        </div>
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
                    {(mode === 'import' ? IMPORT_PHASE_TEXT : PHASE_TEXT)[p]}
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
              {phase === 'uploading'
                ? `Uploading ${progress}%`
                : mode === 'import' ? 'Importing' : 'Analyzing'}
            </>
          ) : (
            <>
              {mode === 'import' ? <History size={18} /> : <ScanLine size={18} />}
              {files.length > 0
                ? `${mode === 'import' ? 'Import' : 'Analyze'} ${files.length} screenshot${files.length > 1 ? 's' : ''}`
                : mode === 'import' ? 'Import' : 'Analyze'}
            </>
          )}
        </span>
      </button>
    </div>
  );
}
