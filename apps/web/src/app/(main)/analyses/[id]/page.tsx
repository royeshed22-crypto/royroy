'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreRing } from '@/components/analysis/score-ring';
import { ReplyCard } from '@/components/analysis/reply-card';
import { analysesApi } from '@/lib/api';
import { Analysis, AnalysisStatus } from '@/lib/types';

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

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const replies = await analysesApi.regenerateReplies(id);
      setAnalysis((prev) => (prev ? { ...prev, replies } : prev));
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Could not generate replies. Try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const poll = useCallback(async () => {
    try {
      const data = await analysesApi.get(id);
      setAnalysis(data);
      if (data.status === 'PENDING' || data.status === 'PROCESSING') {
        setTimeout(poll, 3000);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { poll(); }, [poll]);

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

      {analysis.status === 'COMPLETED' && (
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
              analysis.replies.map((reply) => (
                <motion.div
                  key={reply.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <ReplyCard reply={reply} />
                </motion.div>
              ))
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
