'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Eye, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usersApi } from '@/lib/api';

const points = [
  { icon: Shield, text: 'Your screenshots are processed by OpenAI and deleted after 24 hours.' },
  { icon: Eye,    text: 'We never store the actual messages shown in screenshots.' },
  { icon: Trash2, text: 'You can delete all your data at any time from Profile.' },
];

export default function ConsentPage() {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAccept = async () => {
    setLoading(true);
    try {
      await usersApi.addConsent('TERMS_AND_PRIVACY', '1.0.0');
      router.push('/setup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-6 gap-8">
      <div className="flex flex-col items-center gap-4 pt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center">
          <Shield size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-white">Privacy & Consent</h1>
        <p className="text-white/50 text-sm max-w-xs">
          Before we start, here's what you need to know.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {points.map(({ icon: Icon, text }) => (
          <div key={text} className="glass-card flex items-start gap-3 p-4">
            <Icon size={18} className="text-brand-400 mt-0.5 flex-shrink-0" />
            <p className="text-white/70 text-sm leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 w-4 h-4 accent-brand-500"
        />
        <span className="text-white/60 text-sm">
          I understand and agree to the{' '}
          <span className="text-brand-400 underline">Privacy Policy</span> and{' '}
          <span className="text-brand-400 underline">Terms of Service</span>
        </span>
      </label>

      <div className="mt-auto">
        <Button size="lg" disabled={!accepted || loading} loading={loading} onClick={handleAccept}>
          Continue
        </Button>
      </div>
    </div>
  );
}
