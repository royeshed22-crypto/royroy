'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ScanLine, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { contactsApi } from '@/lib/api';
import { Contact } from '@/lib/types';
import { MemoryPanel } from '@/components/analysis/memory-panel';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    contactsApi.get(id)
      .then((c) => { setContact(c); setNotes(c.notes ?? ''); })
      .finally(() => setLoading(false));
  }, [id]);

  const saveNotes = async () => {
    if (notes === (contact?.notes ?? '')) return;
    setSavingNotes(true);
    try {
      await contactsApi.update(id, { notes });
      setContact((c) => (c ? { ...c, notes } : c));
    } catch {
      toast.error('Could not save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-5 p-5 pt-12">
        <div className="skeleton h-8 w-32 rounded-xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-white/50">Contact not found</p>
        <Button variant="outline" onClick={() => router.back()}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 pt-12 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h1 className="text-xl font-black text-white">{contact.displayName}</h1>
      </div>

      {/* Contact card */}
      <Card className="flex items-center gap-4 p-5">
        <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center text-white font-black text-xl">
          {contact.displayName[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold">{contact.displayName}</p>
          {contact.platform && <p className="text-white/50 text-sm">{contact.platform}</p>}
          <div className="flex items-center gap-2 mt-2">
            {contact.currentVibeScore != null && (
              <Badge variant={contact.currentVibeScore >= 70 ? 'success' : contact.currentVibeScore >= 40 ? 'warning' : 'danger'}>
                Vibe {contact.currentVibeScore}
              </Badge>
            )}
            <Badge variant="default">{contact._count?.analyses ?? 0} scans</Badge>
          </div>
        </div>
      </Card>

      <Link href={`/scan?contact=${id}`}>
        <Button size="lg" className="gap-2">
          <ScanLine size={18} />
          New scan with {contact.displayName}
        </Button>
      </Link>

      {/* Everything learned across every scan, editable so a wrong fact can go */}
      <ErrorBoundary label="What DUGRIZZ knows">
        <MemoryPanel
          contactId={contact.id}
          contactName={contact.displayName}
          memory={contact.aiMemory}
          defaultOpen
          onChange={(m) => setContact((c) => (c ? { ...c, aiMemory: m } : c))}
        />
      </ErrorBoundary>

      {/* Long-lived notes the user keeps themselves */}
      <div className="flex flex-col gap-2">
        <label className="text-white/50 text-[11px] font-medium uppercase tracking-wide">
          📝 Your notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          maxLength={8000}
          placeholder="How you met, what's going on, anything you want factored in"
          className="input-base resize-none text-sm leading-relaxed"
        />
        {savingNotes && <span className="text-brand-400 text-[10px]">Saving…</span>}
      </div>

      {/* Analyses list */}
      {contact.analyses && contact.analyses.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-white font-semibold">Scan history</h3>
          {contact.analyses.map((a: any) => (
            <Link key={a.id} href={`/analyses/${a.id}`}>
              <Card className="flex items-center justify-between p-4 active:scale-[0.98] transition-transform">
                <div>
                  <p className="text-white/70 text-sm">{new Date(a.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.overallScore != null && (
                    <span className={`font-black ${a.overallScore >= 70 ? 'text-emerald-400' : a.overallScore >= 40 ? 'text-yellow-400' : 'text-rose-400'}`}>
                      {a.overallScore}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-white/20" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
