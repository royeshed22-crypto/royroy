'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw, Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreRing } from '@/components/analysis/score-ring';
import { ReplyToneCard } from '@/components/analysis/reply-tone-card';
import { ConversationView } from '@/components/analysis/conversation-view';
import { MemoryPanel } from '@/components/analysis/memory-panel';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { analysesApi } from '@/lib/api';
import { Analysis, AnalysisStatus } from '@/lib/types';

const TONE_ORDER = ['PLAYFUL', 'DIRECT', 'WARM'] as const;

const STATUS_CONFIG: Record<AnalysisStatus, { label: string; color: string }> = {
  PENDING:    { label: 'Queued',     color: 'text-white/50' },
  PROCESSING: { label: 'Analyzing…', color: 'text-brand-400' },
  COMPLETED:  { label: 'Done',       color: 'text-emerald-400' },
  FAILED:     { label: 'Failed',     color: 'text-rose-400' },
  BLOCKED:    { label: 'Blocked',    color: 'text-orange-400' },
};

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const regenLock = useRef(false);

  const handleRegenerate = async () => {
    // Ref rather than state: setState is async, so rapid clicks can slip through
    // the disabled check before React re-renders.
    if (regenLock.current) return;
    regenLock.current = true;

    setRegenerating(true);
    try {
      const replies = await analysesApi.regenerateReplies(id);
      setAnalysis((prev) => (prev ? { ...prev, replies } : prev));
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Could not generate replies. Try again.');
    } finally {
      setRegenerating(false);
      regenLock.current = false;
    }
  };

  useEffect(() => {
    // Cancelled on unmount so navigating away stops the timer instead of
    // leaving a polling chain running against a dead component.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const data = await analysesApi.get(id);
        if (cancelled) return;

        setAnalysis(data);
        if (data.status === 'PENDING' || data.status === 'PROCESSING') {
          timer = setTimeout(poll, 3000);
        }
      } catch {
        // Transient failure; the next tick retries.
        if (!cancelled) timer = setTimeout(poll, 5000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="text-brand-400 animate-spin" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <AlertTriangle size={40} className="text-rose-400" />
        <p className="text-white/60">Analysis not found</p>
      </div>
    );
  }

  const isPending = analysis.status === 'PENDING' || analysis.status === 'PROCESSING';
  const isBlocked = analysis.status === 'BLOCKED';
  const isFailed = analysis.status === 'FAILED';

  return (
    <div className="flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 p-5 pt-12">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-black text-white">
            {analysis.contact?.displayName ?? 'Analysis'}
          </h1>
          <p className={`text-xs font-medium ${STATUS_CONFIG[analysis.status].color}`}>
            {STATUS_CONFIG[analysis.status].label}
          </p>
        </div>
      </div>

      {isPending && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 size={48} className="text-brand-400 animate-spin" />
          <p className="text-white/50 text-sm">AI is reading the vibes…</p>
        </div>
      )}

      {isBlocked && (
        <Card className="mx-5 text-center py-10 flex flex-col items-center gap-3">
          <AlertTriangle size={40} className="text-orange-400" />
          <h3 className="text-white font-bold">Content blocked</h3>
          <p className="text-white/50 text-sm max-w-xs">
            This screenshot contains content we cannot analyze. Please try with a different conversation.
          </p>
        </Card>
      )}

      {isFailed && (
        <Card className="mx-5 text-center py-10 flex flex-col items-center gap-3">
          <XCircle size={40} className="text-rose-400" />
          <h3 className="text-white font-bold">Analysis failed</h3>
          <p className="text-white/50 text-sm">{analysis.failureCode ?? 'Something went wrong. Try again.'}</p>
        </Card>
      )}

      {/* An import has no scores or replies — just report what landed. */}
      {analysis.status === 'COMPLETED' && analysis.isImport && (
        <div className="flex flex-col gap-5 px-5 pb-8">
          <Card className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center">
              <CheckCircle size={26} className="text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Conversation saved</h3>
              <p className="text-white/50 text-sm mt-1">
                {analysis.contact?.displayName} now has history behind them.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full max-w-sm pt-2">
              {[
                { label: 'Read', value: analysis.messagesFound ?? 0 },
                { label: 'New', value: analysis.messagesNew ?? 0 },
                { label: 'Total', value: analysis.totalMessages ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className="text-2xl font-black text-white tabular-nums">{value}</span>
                  <span className="text-[10px] text-white/40 uppercase tracking-wide">{label}</span>
                </div>
              ))}
            </div>

            {(analysis.messagesFound ?? 0) > (analysis.messagesNew ?? 0) && (
              <p className="text-white/35 text-xs max-w-xs">
                {(analysis.messagesFound ?? 0) - (analysis.messagesNew ?? 0)} messages
                were already known and got merged rather than duplicated.
              </p>
            )}
          </Card>

          {analysis.messages && analysis.messages.length > 0 && (
            <ErrorBoundary label="The conversation">
              <ConversationView messages={analysis.messages} />
            </ErrorBoundary>
          )}

          {analysis.contact && (
            <ErrorBoundary label="What DUGRIZZ knows">
              <MemoryPanel
                contactId={analysis.contact.id}
                contactName={analysis.contact.displayName}
                memory={analysis.contact.aiMemory}
                defaultOpen
              />
            </ErrorBoundary>
          )}

          <Link href="/scan">
            <button className="w-full brand-btn py-3.5 text-base">
              Scan new messages
            </button>
          </Link>
        </div>
      )}

      {analysis.status === 'COMPLETED' && !analysis.isImport && (
        <div className="flex flex-col gap-5 px-5 pb-8">
          {/* Scores */}
          <div className="flex justify-around py-4">
            {[
              { label: 'Overall', value: analysis.overallScore, sub: 'score' },
              { label: 'Vibe',    value: analysis.vibeScore,    sub: 'energy' },
              { label: 'Interest', value: analysis.interestScore, sub: 'level' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="relative flex items-center justify-center">
                <ScoreRing score={value ?? 0} size={100} strokeWidth={7} label={label} sublabel={sub} />
              </div>
            ))}
          </div>

          {/* Stage badge */}
          {analysis.conversationStage && (
            <div className="flex justify-center">
              <Badge variant="brand">{analysis.conversationStage}</Badge>
            </div>
          )}

          {/* Summary */}
          {analysis.summary && (
            <Card>
              <p className="text-white/80 text-sm leading-relaxed">{analysis.summary}</p>
            </Card>
          )}

          {/* What the user said the screenshots couldn't show */}
          {analysis.userContext && (
            <Card className="border-brand-500/20 bg-brand-500/5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles size={12} className="text-brand-400" />
                <span className="text-brand-300 text-[11px] font-medium uppercase tracking-wide">
                  Your context
                </span>
              </div>
              <p className="text-white/70 text-xs leading-relaxed whitespace-pre-wrap">
                {analysis.userContext}
              </p>
            </Card>
          )}

          {/* The extracted conversation */}
          {analysis.messages && analysis.messages.length > 0 && (
            <ErrorBoundary label="The conversation">
              <ConversationView messages={analysis.messages} />
            </ErrorBoundary>
          )}

          {/* Accumulated knowledge about this person */}
          {analysis.contact && (
            <ErrorBoundary label="What DUGRIZZ knows">
              <MemoryPanel
                contactId={analysis.contact.id}
                contactName={analysis.contact.displayName}
                memory={analysis.contact.aiMemory}
              />
            </ErrorBoundary>
          )}

          {/* Recommended action */}
          {analysis.recommendedAction && (
            <Card className="flex items-start gap-3">
              <CheckCircle size={18} className="text-brand-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white font-semibold text-sm">{analysis.recommendedAction.type}</p>
                <p className="text-white/50 text-xs mt-1">{analysis.recommendedAction.explanation}</p>
              </div>
            </Card>
          )}

          {/* Flags */}
          {((analysis.greenFlags?.length ?? 0) > 0 || (analysis.redFlags?.length ?? 0) > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {analysis.greenFlags && analysis.greenFlags.length > 0 && (
                <Card className="bg-emerald-500/5 border-emerald-500/20">
                  <p className="text-emerald-400 text-xs font-semibold mb-2">Green flags</p>
                  {analysis.greenFlags.map((f, i) => (
                    <p key={i} className="text-white/70 text-xs mt-1 flex gap-1.5 items-start">
                      <span className="text-emerald-400">✓</span>{f}
                    </p>
                  ))}
                </Card>
              )}
              {analysis.redFlags && analysis.redFlags.length > 0 && (
                <Card className="bg-rose-500/5 border-rose-500/20">
                  <p className="text-rose-400 text-xs font-semibold mb-2">Red flags</p>
                  {analysis.redFlags.map((f, i) => (
                    <p key={i} className="text-white/70 text-xs mt-1 flex gap-1.5 items-start">
                      <span className="text-rose-400">✗</span>{f}
                    </p>
                  ))}
                </Card>
              )}
            </div>
          )}

          {/* Replies */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">Suggested replies</h3>
              {analysis.replies && analysis.replies.length > 0 && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white/60 text-xs font-medium hover:text-white hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
                  {regenerating ? 'Generating...' : 'New set'}
                </button>
              )}
            </div>

            {analysis.replies && analysis.replies.length > 0 ? (
              TONE_ORDER.map((tone, i) => {
                const group = analysis.replies!.filter((r) => r.tone === tone);
                if (group.length === 0) return null;

                return (
                  <motion.div
                    key={tone}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <ReplyToneCard tone={tone} replies={group} />
                  </motion.div>
                );
              })
            ) : (
              <Card className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-white/50 text-sm">
                  Replies couldn't be generated for this analysis.
                </p>
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} />
                  {regenerating ? 'Generating...' : 'Generate replies'}
                </button>
              </Card>
            )}
          </div>

          {analysis.disclaimer && (
            <p className="text-white/30 text-xs text-center px-4">{analysis.disclaimer}</p>
          )}
        </div>
      )}
    </div>
  );
}
