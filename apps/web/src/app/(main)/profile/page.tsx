'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { LogOut, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth.store';
import { getRank } from '@/lib/types';

export default function ProfilePage() {
  const { user, updateUser, reset } = useAuthStore();
  const [name, setName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const rank = getRank(user?.eloScore ?? 1000);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser({ displayName: name.trim() });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    reset();
    router.replace('/');
  };

  return (
    <div className="flex flex-col gap-6 p-5 pt-12 animate-fade-in">
      <h1 className="text-2xl font-black text-white">Profile</h1>

      {/* Rank card */}
      <Card className="bg-brand-gradient border-0 flex items-center gap-4 p-5">
        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl">
          {rank.emoji}
        </div>
        <div>
          <p className="text-white/70 text-xs">Your rank</p>
          <p className="text-white font-black text-xl">{rank.label}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="default" className="bg-white/20 text-white border-0">
              {user?.eloScore ?? 1000} ELO
            </Badge>
            {user?.isPro && <Badge variant="brand">PRO</Badge>}
          </div>
        </div>
      </Card>

      {/* Edit name */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-white/60 font-medium">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-base"
          maxLength={30}
        />
        <Button size="md" onClick={handleSave} loading={saving} disabled={!name.trim() || saving}>
          Save changes
        </Button>
      </div>

      {/* Account */}
      <div className="flex flex-col gap-3">
        <h3 className="text-white/60 text-sm font-medium">Account</h3>

        <Card className="flex items-center justify-between p-4">
          <span className="text-white/70 text-sm">Language</span>
          <span className="text-white/40 text-sm">{user?.language ?? 'en'}</span>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <span className="text-white/70 text-sm">Streak</span>
          <span className="text-white font-bold">{user?.streakDays ?? 0} days 🔥</span>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-4">
        <Button variant="outline" size="md" onClick={handleLogout} className="gap-2">
          <LogOut size={16} />
          Sign out
        </Button>
        <Button
          variant="danger"
          size="md"
          className="gap-2"
          onClick={() => toast('Contact support to delete your account.', { icon: '📧' })}
        >
          <Trash2 size={16} />
          Delete account
        </Button>
      </div>

      <p className="text-white/20 text-xs text-center pb-4">DUGRIZZ v1.0.0 · AI Dating Coach</p>
    </div>
  );
}
