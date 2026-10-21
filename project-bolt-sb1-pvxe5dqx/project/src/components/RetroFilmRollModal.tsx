import { useState, useEffect } from 'react';
import { X, Volume2, ChevronLeft, ChevronRight, Play, Pause, Shuffle, Sparkles, Film } from 'lucide-react';
import { speak } from '@/lib/speech';
import type { Vocabulary } from '@/lib/types';

interface RetroFilmRollModalProps {
  isOpen: boolean;
  onClose: () => void;
  vocabs: Vocabulary[];
}

export function RetroFilmRollModal({ isOpen, onClose, vocabs }: RetroFilmRollModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsPlaying(false);
      setFlipped(false);
    }
  }, [isOpen]);

  // Auto-play slideshow for vlog reel vibe
  useEffect(() => {
    if (!isPlaying || vocabs.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % vocabs.length);
      setFlipped(false);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPlaying, vocabs.length]);

  if (!isOpen || vocabs.length === 0) return null;

  const current = vocabs[currentIndex] || vocabs[0];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % vocabs.length);
    setFlipped(false);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + vocabs.length) % vocabs.length);
    setFlipped(false);
  };

  const handleShuffle = () => {
    const random = Math.floor(Math.random() * vocabs.length);
    setCurrentIndex(random);
    setFlipped(false);
  };

  const handleSpeak = (e: React.MouseEvent) => {
    e.stopPropagation();
    speak(current.word);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md mx-auto">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between mb-3 text-amber-100">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-400 text-xs font-mono font-bold tracking-wider animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> REC
            </span>
            <span className="text-xs font-mono text-amber-200/70 tracking-widest">
              KODAK 400 • {currentIndex + 1}/{vocabs.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 transition-colors"
              title={isPlaying ? 'Tạm dừng auto' : 'Tự động chạy Vlog'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={handleShuffle}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 transition-colors"
              title="Xáo trộn ngẫu nhiên"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-500/30 text-stone-300 hover:text-white transition-colors"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 35mm Retro Film Card (Reels Format - matching Image 2) */}
        <div
          onClick={() => setFlipped(!flipped)}
          className="film-frame-card cursor-pointer select-none transition-transform duration-300 hover:scale-[1.01]"
          style={{ minHeight: '520px' }}
        >
          {/* Top Film Sprocket Track */}
          <div className="film-sprocket-track">
            <div className="sprocket-holes">
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
            </div>
            <span className="text-[10px] text-amber-400 font-bold tracking-widest">
              ■ {currentIndex + 1} ■■■ {currentIndex + 1}A ■■■
            </span>
            <div className="sprocket-holes">
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
            </div>
          </div>

          {/* Card Body with Camcorder Viewfinder & Vintage Aesthetics */}
          <div className="p-7 camcorder-overlay flex flex-col justify-between" style={{ minHeight: '464px' }}>
            {/* Top metadata inside frame */}
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-mono text-amber-300/80 tracking-widest flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-amber-400" />
                <span>VLOG #2026 • {current.type || 'WORD'}</span>
              </div>
              <button
                onClick={handleSpeak}
                className="w-9 h-9 rounded-full bg-amber-400/20 hover:bg-amber-400/40 border border-amber-400/50 flex items-center justify-center text-amber-300 transition-all hover:scale-110"
                title="Phát âm từ"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {/* Center Content: Front (Word) or Back (Meaning & Context) */}
            {!flipped ? (
              <div className="my-auto text-center py-8">
                {/* Vintage Serif Golden Title (Exact style from Image 2) */}
                <h2 className="text-4xl sm:text-5xl font-serif font-black text-amber-400 tracking-tight leading-tight mb-3 drop-shadow-md">
                  {current.word}
                </h2>

                {/* Phonetic in cursive handwriting */}
                {current.phonetic && (
                  <p className="text-2xl font-handwriting text-amber-100/90 tracking-wide mb-6">
                    /{current.phonetic.replace(/^\/|\/$/g, '')}/
                  </p>
                )}

                {/* Subtitle Hint */}
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-stone-900/80 border border-stone-700/60 text-stone-300 text-xs font-mono">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Chạm để lật xem nghĩa & ví dụ ↺</span>
                </div>
              </div>
            ) : (
              <div className="my-auto text-left py-4 px-2 space-y-4 animate-fade-in">
                {/* Meaning */}
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400/70 block mb-1">
                    Ý nghĩa tiếng Việt
                  </span>
                  <p className="text-2xl font-serif font-bold text-amber-200">
                    {current.meaning}
                  </p>
                </div>

                {/* Example sentence */}
                {current.example && (
                  <div className="p-3.5 rounded-xl bg-stone-900/90 border border-amber-500/20">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-stone-400 block mb-1">
                      Ngữ cảnh / Câu ví dụ
                    </span>
                    <p className="text-sm font-serif italic text-amber-100/90 leading-relaxed">
                      "{current.example}"
                    </p>
                    {current.exampleMeaning && (
                      <p className="text-xs text-stone-400 mt-1.5 font-sans">
                        👉 {current.exampleMeaning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom film metadata */}
            <div className="flex items-center justify-between text-xs font-mono text-stone-400 pt-4 border-t border-stone-800">
              <span className="font-handwriting text-lg text-amber-300/80">
                Memories & Vocab
              </span>
              <span className="text-[11px] tracking-widest text-amber-400/60">
                FPS 24 • ISO 400
              </span>
            </div>
          </div>

          {/* Bottom Film Sprocket Track */}
          <div className="film-sprocket-bottom">
            <div className="sprocket-holes">
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
            </div>
            <span className="text-[10px] text-amber-400 font-bold tracking-widest">
              VOCABMASTER 35MM
            </span>
            <div className="sprocket-holes">
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
            </div>
          </div>
        </div>

        {/* Navigation Arrows */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={handlePrev}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900/90 hover:bg-stone-800 text-amber-200 border border-stone-700 text-sm font-semibold transition-all hover:-translate-x-0.5"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Từ trước</span>
          </button>

          <span className="text-xs font-mono text-stone-400">
            Dùng phím mũi tên hoặc nút bấm
          </span>

          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm transition-all hover:translate-x-0.5 shadow-md"
          >
            <span>Từ tiếp theo</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
