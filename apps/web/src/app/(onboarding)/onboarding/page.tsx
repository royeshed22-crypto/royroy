'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const slides = [
  {
    emoji: '📸',
    title: 'Screenshot → Strategy',
    desc: 'Upload any chat screenshot and our AI reads the vibe instantly.',
  },
  {
    emoji: '🎯',
    title: 'Know their intent',
    desc: 'Green flags, red flags, vibe score, interest level — all at a glance.',
  },
  {
    emoji: '💬',
    title: 'Reply like a pro',
    desc: '3 AI-crafted replies in different tones, tailored to the moment.',
  },
];

export default function OnboardingPage() {
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  const isLast = idx === slides.length - 1;
  const slide = slides[idx];

  const next = () => {
    if (isLast) router.push('/age');
    else setIdx((i) => i + 1);
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-8">
      {/* Logo */}
      <div className="flex items-center gap-2 pt-4">
        <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center text-white font-black text-sm">
          D
        </div>
        <span className="text-white font-bold text-lg tracking-tight">DUGRIZZ</span>
      </div>

      {/* Slide */}
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-6 text-center max-w-sm"
        >
          <div className="text-8xl">{slide.emoji}</div>
          <h1 className="text-3xl font-black text-white leading-tight">{slide.title}</h1>
          <p className="text-white/60 text-lg leading-relaxed">{slide.desc}</p>
        </motion.div>
      </AnimatePresence>

      {/* Bottom */}
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        {/* Dots */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-8 bg-brand-500' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>

        <Button size="lg" onClick={next}>
          {isLast ? "Let's go" : 'Continue'}
          <ChevronRight size={18} />
        </Button>
      </div>
    </div>
  );
}
