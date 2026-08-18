'use client';
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
}

export function Dropzone({ files, onChange, maxFiles = 10 }: DropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const merged = [...files, ...accepted].slice(0, maxFiles);
      onChange(merged);
    },
    [files, onChange, maxFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles,
    maxSize: 20 * 1024 * 1024,
  });

  const remove = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-brand-500 bg-brand-500/10'
            : 'border-white/20 hover:border-brand-500/50 hover:bg-white/5',
        )}
      >
        <input {...getInputProps()} />
        <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center">
          <ImagePlus size={24} className="text-white" />
        </div>
        <div className="text-center">
          <p className="text-white font-medium">
            {isDragActive ? 'Drop screenshots here' : 'Upload screenshots'}
          </p>
          <p className="text-white/40 text-sm mt-1">
            Drag & drop or tap to select • up to {maxFiles} images • 20MB each
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {files.map((file, idx) => (
            <div key={idx} className="relative rounded-xl overflow-hidden bg-surface-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt={`screenshot ${idx + 1}`}
                className="w-full h-auto object-contain"
              />
              <button
                onClick={() => remove(idx)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-rose-500/80 transition-colors"
              >
                <X size={12} className="text-white" />
              </button>
              <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {idx + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
