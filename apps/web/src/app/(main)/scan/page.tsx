'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dropzone } from '@/components/upload/dropzone';
import { Button } from '@/components/ui/button';
import { uploadsApi, analysesApi, contactsApi } from '@/lib/api';

export default function ScanPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [contactName, setContactName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  const handleScan = async () => {
    if (files.length === 0) { toast.error('Add at least one screenshot'); return; }
    setUploading(true);
    try {
      const uploads = await uploadsApi.upload(files, setProgress);
      const uploadIds = uploads.map((u: any) => u.id);

      let contactId: string | undefined;
      if (contactName.trim()) {
        const contact = await contactsApi.create({ displayName: contactName.trim() });
        contactId = contact.id;
      }

      const analysis = await analysesApi.create(uploadIds, contactId);
      router.push(`/analyses/${analysis.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Upload failed. Try again.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-5 pt-12 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-white">Scan a conversation</h1>
        <p className="text-white/50 text-sm mt-1">Upload 1–10 screenshots to analyze</p>
      </div>

      <Dropzone files={files} onChange={setFiles} />

      {/* Optional contact name */}
      <div className="flex flex-col gap-2">
        <label className="text-sm text-white/60 font-medium">Who is this? (optional)</label>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="e.g. Alex from Tinder"
          className="input-base"
          maxLength={50}
        />
      </div>

      {uploading && (
        <div className="flex flex-col gap-2">
          <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-white/50 text-xs text-center">
            {progress < 100 ? `Uploading... ${progress}%` : 'Analyzing with AI...'}
          </p>
        </div>
      )}

      <div className="mt-auto">
        <Button
          size="lg"
          onClick={handleScan}
          disabled={files.length === 0 || uploading}
          loading={uploading}
        >
          {uploading ? 'Analyzing...' : `Analyze ${files.length > 0 ? `${files.length} screenshot${files.length > 1 ? 's' : ''}` : ''}`}
        </Button>
      </div>
    </div>
  );
}
