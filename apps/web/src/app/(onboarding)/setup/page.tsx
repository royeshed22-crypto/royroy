'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const GOALS = [
  { id: 'FLIRT', label: '🔥 Flirt better' },
  { id: 'DATE', label: '📅 Get the date' },
  { id: 'CONNECT', label: '💞 Build connection' },
  { id: 'UNDERSTAND', label: '🧠 Read the room' },
];

const STYLES = [
  { id: 'PLAYFUL', label: '😄 Playful' },
  { id: 'DIRECT', label: '🎯 Direct' },
  { id: 'WARM', label: '🤗 Warm' },
  { id: 'MYSTERIOUS', label: '🌙 Mysterious' },
];

export default function SetupPage() {
  const [name, setName] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [style, setStyle] = useState('');
  const [loading, setLoading] = useState(false);
  const { updateUser, setOnboardingComplete } = useAuthStore();
  const router = useRouter();

  const toggleGoal = (id: string) =>
    setGoals((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));

  const canContinue = name.trim() && goals.length > 0 && style;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await updateUser({
        displayName: name.trim(),
        goals,
        communicationStyle: style,
      });
      setOnboardingComplete(true);
      router.push('/home');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen p-6 gap-8">
      <div className="pt-8">
        <h1 className="text-2xl font-black text-white">Set up your profile</h1>
        <p className="text-white/50 text-sm mt-1">Personalize your coaching experience</p>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-white/60 font-medium">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should we call you?"
          className="input-base"
          maxLength={30}
        />
      </div>

      {/* Goals */}
      <div className="flex flex-col gap-3">
        <label className="text-sm text-white/60 font-medium">What are you working on? (pick all that apply)</label>
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => toggleGoal(id)}
              className={cn(
                'py-3 px-4 rounded-xl text-sm font-medium text-left transition-all duration-200 border',
                goals.includes(id)
                  ? 'bg-brand-600/30 border-brand-500 text-white'
                  : 'bg-surface-700 border-white/10 text-white/60 hover:border-white/30',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="flex flex-col gap-3">
        <label className="text-sm text-white/60 font-medium">Your natural vibe</label>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setStyle(id)}
              className={cn(
                'py-3 px-4 rounded-xl text-sm font-medium text-left transition-all duration-200 border',
                style === id
                  ? 'bg-brand-600/30 border-brand-500 text-white'
                  : 'bg-surface-700 border-white/10 text-white/60 hover:border-white/30',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto">
        <Button size="lg" disabled={!canContinue || loading} loading={loading} onClick={handleSubmit}>
          Start coaching
        </Button>
      </div>
    </div>
  );
}
