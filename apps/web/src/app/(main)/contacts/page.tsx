'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, ChevronRight, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { contactsApi } from '@/lib/api';
import { Contact } from '@/lib/types';

function vibeColor(score?: number) {
  if (!score) return 'default';
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'danger';
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    contactsApi.list()
      .then(setContacts)
      .finally(() => setLoading(false));
  }, []);

  const filtered = contacts.filter((c) =>
    c.displayName.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-5 p-5 pt-12 animate-fade-in">
      <h1 className="text-2xl font-black text-white">Contacts</h1>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contacts..."
          className="input-base pl-10"
        />
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded-2xl h-20" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="text-center py-12 flex flex-col items-center gap-3">
          <MessageCircle size={40} className="text-white/20" />
          <p className="text-white/50 text-sm">
            {query ? 'No contacts found' : 'No contacts yet. Scan a conversation to create one!'}
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((c) => (
          <Link key={c.id} href={`/contacts/${c.id}`}>
            <Card className="flex items-center justify-between p-4 active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-gradient flex items-center justify-center text-white font-bold text-sm">
                  {c.displayName[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{c.displayName}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {c._count?.analyses ?? 0} analyses
                    {c.platform ? ` · ${c.platform}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.currentVibeScore != null && (
                  <Badge variant={vibeColor(c.currentVibeScore)}>
                    {c.currentVibeScore}
                  </Badge>
                )}
                <ChevronRight size={16} className="text-white/20" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
