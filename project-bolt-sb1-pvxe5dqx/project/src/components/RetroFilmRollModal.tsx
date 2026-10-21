import { useState, useEffect } from 'react';
import { X, Volume2, ChevronLeft, ChevronRight, Play, Pause, Shuffle, Sparkles, Film, Image as ImageIcon } from 'lucide-react';
import { speak } from '@/lib/speech';
import type { Vocabulary } from '@/lib/types';

interface RetroFilmRollModalProps {
  isOpen: boolean;
  onClose: () => void;
  vocabs: Vocabulary[];
}

const VLOG_BACKGROUNDS = [
  {
    id: 'film-amber',
    name: 'Kodak 35mm',
    gradient: 'radial-gradient(circle at 20% 20%, rgba(217, 119, 6, 0.28) 0%, rgba(17, 14, 12, 0.95) 60%), linear-gradient(180deg, #1a1510 0%, #0d0a08 100%)',
    textColor: 'text-amber-300',
    accentBorder: 'border-amber-500/30',
  },
  {
    id: 'forest',
    name: 'Cúc Phương',
    gradient: 'radial-gradient(circle at 80% 30%, rgba(40, 95, 65, 0.35) 0%, rgba(12, 18, 14, 0.95) 65%), linear-gradient(180deg, #0e1812 0%, #080d09 100%)',
    textColor: 'text-emerald-300',
    accentBorder: 'border-emerald-500/30',
  },
  {
    id: 'sunset',
    name: 'Roadtrip',
    gradient: 'radial-gradient(circle at 50% 20%, rgba(235, 90, 45, 0.32) 0%, rgba(22, 14, 12, 0.95) 65%), linear-gradient(180deg, #1c110c 0%, #0c0806 100%)',
    textColor: 'text-orange-300',
    accentBorder: 'border-orange-500/30',
  },
  {
    id: 'daisy',
    name: 'Daisy Flower',
    gradient: 'radial-gradient(circle at 30% 70%, rgba(245, 190, 20, 0.25) 0%, rgba(18, 16, 12, 0.95) 65%), linear-gradient(180deg, #16140e 0%, #0a0907 100%)',
    textColor: 'text-yellow-300',
    accentBorder: 'border-yellow-500/30',
  },
];

export function RetroFilmRollModal({ isOpen, onClose, vocabs }: RetroFilmRollModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);

  const currentBg = VLOG_BACKGROUNDS[bgIndex];

  // Mỗi khi mở cuộn phim, luôn bốc ngẫu nhiên 1 thẻ
  useEffect(() => {
    if (isOpen && vocabs.length > 0) {
      const randomIndex = Math.floor(Math.random() * vocabs.length);
      setCurrentIndex(randomIndex);
      setIsPlaying(false);
      setFlipped(false);
    }
  }, [isOpen, vocabs.length]);

  const current = vocabs[currentIndex] || vocabs[0];

  const handleNext = () => {
    if (vocabs.length === 0) return;
    if (isShuffle && vocabs.length > 1) {
      let nextIndex = Math.floor(Math.random() * vocabs.length);
      while (nextIndex === currentIndex && vocabs.length > 1) {
        nextIndex = Math.floor(Math.random() * vocabs.length);
      }
      setCurrentIndex(nextIndex);
    } else {
      setCurrentIndex((prev) => (prev + 1) % vocabs.length);
    }
    setFlipped(false);
  };

  const handlePrev = () => {
    if (vocabs.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + vocabs.length) % vocabs.length);
    setFlipped(false);
  };

  const handleShuffle = () => {
    if (vocabs.length === 0) return;
    let nextIndex = Math.floor(Math.random() * vocabs.length);
    while (nextIndex === currentIndex && vocabs.length > 1) {
      nextIndex = Math.floor(Math.random() * vocabs.length);
    }
    setCurrentIndex(nextIndex);
    setFlipped(false);
  };

  const handleSpeak = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (current) speak(current.word);
  };

  // Keyboard navigation support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P') {
        if (current) speak(current.word);
      } else if (e.key === 'r' || e.key === 'R') {
        handleShuffle();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, vocabs.length, currentIndex, current, isShuffle]);

  // Auto-play slideshow for vlog reel vibe
  useEffect(() => {
    if (!isPlaying || vocabs.length === 0) return;
    const timer = setInterval(() => {
      if (isShuffle && vocabs.length > 1) {
        let nextIndex = Math.floor(Math.random() * vocabs.length);
        while (nextIndex === currentIndex && vocabs.length > 1) {
          nextIndex = Math.floor(Math.random() * vocabs.length);
        }
        setCurrentIndex(nextIndex);
      } else {
        setCurrentIndex((prev) => (prev + 1) % vocabs.length);
      }
      setFlipped(false);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPlaying, vocabs.length, currentIndex, isShuffle]);

  if (!isOpen || vocabs.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-[460px] mx-auto my-auto py-1">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between mb-2 text-amber-100 px-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/60 text-rose-400 text-[11px] font-mono font-bold tracking-wider animate-pulse shadow-xs">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> REC
            </span>
            <span className="text-[11px] font-mono text-amber-200/80 tracking-widest">
              KODAK PORTRA • {currentIndex + 1}/{vocabs.length}
            </span>
          </div>

          {/* Background Mood & Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setBgIndex((prev) => (prev + 1) % VLOG_BACKGROUNDS.length)}
              className="px-2 py-0.5 rounded-lg bg-stone-900/90 hover:bg-stone-800 border border-stone-700/80 text-amber-200 text-[11px] font-mono flex items-center gap-1 transition-all"
              title="Đổi phong cảnh Retro (Cúc Phương, Roadtrip, Daisy, Kodak)"
            >
              <ImageIcon className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">{currentBg.name}</span>
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1 rounded-lg bg-stone-900/90 hover:bg-stone-800 border border-stone-700/80 text-amber-200 transition-colors"
              title={isPlaying ? 'Tạm dừng auto' : 'Tự động chạy Vlog'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-amber-400" />}
            </button>
            <button
              onClick={handleShuffle}
              className="p-1 rounded-lg bg-stone-900/90 hover:bg-stone-800 border border-stone-700/80 text-amber-200 transition-colors"
              title="Xáo trộn ngẫu nhiên"
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg bg-stone-900/90 hover:bg-rose-500/40 border border-stone-700/80 text-stone-300 hover:text-white transition-colors ml-0.5"
              title="Đóng (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 35mm Retro Film Card (Proportional, floats comfortably in viewport) */}
        <div
          onClick={() => setFlipped(!flipped)}
          className="film-frame-card cursor-pointer select-none transition-all duration-300 hover:shadow-[0_16px_40px_rgba(0,0,0,0.8)] border-2 border-stone-800"
          style={{ minHeight: '390px' }}
        >
          {/* Top Film Sprocket Track */}
          <div className="film-sprocket-track">
            <div className="sprocket-holes">
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-amber-400 font-bold tracking-widest">
                ■ {currentIndex + 1} ■■■ {currentIndex + 1}A ■■■
              </span>
              <span className="text-[8px] text-amber-400/60 hidden sm:inline tracking-widest">
                ISO 400
              </span>
            </div>
            <div className="sprocket-holes">
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
            </div>
          </div>

          {/* Card Body with Camcorder Viewfinder & Retro Atmosphere Background */}
          <div
            className="p-4 sm:p-6 camcorder-overlay flex flex-col justify-between relative transition-all duration-500"
            style={{
              minHeight: '342px',
              background: currentBg.gradient,
            }}
          >
            {/* Viewfinder Camcorder HUD top */}
            <div className="flex items-center justify-between text-xs font-mono z-10">
              <div className="flex items-center gap-2 text-amber-300/80 tracking-widest text-[10px]">
                <Film className="w-3 h-3 text-amber-400" />
                <span className="font-bold">VLOG #2026</span>
                <span className="text-stone-500">•</span>
                <span className="uppercase text-amber-400/90">{current.type || 'WORD'}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-stone-400 hidden sm:inline">
                  SP 4:3
                </span>
                <button
                  onClick={handleSpeak}
                  className="w-8 h-8 rounded-full bg-amber-400/20 hover:bg-amber-400/40 border border-amber-400/60 flex items-center justify-center text-amber-300 transition-all hover:scale-110 shadow-md cursor-pointer"
                  title="Phát âm từ (Phím S)"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Center Content: Front (Word) or Back (Meaning & Context) */}
            {!flipped ? (
              <div className="my-auto text-center py-3 sm:py-5 z-10">
                {/* Nostalgic Handwritten Subtitle */}
                <p className="text-base sm:text-lg font-handwriting text-amber-200/90 tracking-wide mb-1.5 drop-shadow-sm">
                  {current.category ? `~ ${current.category} ~` : '✨ vocabulary memory'}
                </p>

                {/* Big Vintage Serif Golden Title */}
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-black text-amber-300 tracking-tight leading-snug mb-2 sm:mb-3 drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)]">
                  {current.word}
                </h2>

                {/* Phonetics in clean retro badge */}
                {current.phonetic && (
                  <div className="mb-3 sm:mb-4">
                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-black/60 border border-amber-400/40 text-amber-200 font-mono text-xs tracking-wider shadow-sm">
                      /{current.phonetic.replace(/^\/|\/$/g, '')}/
                    </span>
                  </div>
                )}

                {/* Flip Hint */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-sm border border-amber-400/30 text-amber-200 text-[11px] font-mono shadow-sm hover:border-amber-400/60 transition-colors">
                  <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
                  <span>Chạm để lật xem nghĩa & ngữ cảnh ↺</span>
                </div>
              </div>
            ) : (
              <div className="my-auto text-left py-1 px-0.5 space-y-2.5 sm:space-y-3 z-10 animate-fade-in">
                {/* Meaning Section */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-black/75 backdrop-blur-md border border-amber-500/40 shadow-lg">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/80 block mb-0.5">
                    Ý NGHĨA TIẾNG VIỆT
                  </span>
                  <p className="text-xl sm:text-2xl font-serif font-bold text-amber-100 leading-snug drop-shadow-sm">
                    {current.meaning}
                  </p>
                </div>

                {/* Example sentence formatted like cinematic movie subtitles */}
                {current.example && (
                  <div className="p-3 sm:p-3.5 rounded-xl bg-black/85 backdrop-blur-md border border-stone-700/80 shadow-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/70">
                        SUBTITLE • VÍ DỤ NGỮ CẢNH
                      </span>
                      <span className="text-[9px] font-mono text-stone-400">[00:01:24]</span>
                    </div>
                    <p className="text-sm sm:text-base font-serif italic text-amber-200 leading-relaxed">
                      "{current.example}"
                    </p>
                    {current.exampleMeaning && (
                      <p className="text-xs text-stone-300 mt-2 pt-1.5 border-t border-stone-800/80 font-sans">
                        👉 {current.exampleMeaning}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom camcorder metadata */}
            <div className="flex items-center justify-between text-xs font-mono text-stone-400 pt-2 border-t border-stone-800/80 z-10">
              <span className="font-handwriting text-lg text-amber-300/90">
                Memories & Vocab
              </span>
              <span className="text-[10px] tracking-widest text-amber-400/70 font-mono">
                24 FPS • HI-FI STEREO
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
              <span className="sprocket-hole"></span>
            </div>
            <span className="text-[9px] text-amber-400 font-bold tracking-widest">
              VOCABMASTER 35MM • VLOG REEL
            </span>
            <div className="sprocket-holes">
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
              <span className="sprocket-hole"></span>
            </div>
          </div>
        </div>

        {/* Navigation Buttons: Clean, generous spacing */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 mt-2.5 sm:mt-3">
          <button
            onClick={handlePrev}
            className="flex-1 flex items-center justify-center gap-1 px-2.5 sm:px-3 py-2 rounded-xl bg-stone-900/95 hover:bg-stone-800 text-amber-200 border border-stone-700/80 text-xs sm:text-sm font-semibold transition-all hover:-translate-x-0.5 cursor-pointer shadow-md"
            title="Từ trước đó (Phím ←)"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-amber-400" />
            <span>Trước</span>
          </button>

          <button
            onClick={() => setFlipped(!flipped)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900/95 hover:bg-stone-800 text-stone-300 border border-stone-700/80 text-xs font-mono transition-all cursor-pointer shadow-md"
            title="Lật thẻ xem nghĩa (Phím Space)"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>{flipped ? 'Xem từ' : 'Xem nghĩa'}</span>
          </button>

          <button
            onClick={handleShuffle}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-950/80 to-stone-900/95 hover:from-amber-900/90 hover:to-stone-850 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold transition-all cursor-pointer shadow-md hover:border-amber-400 active:scale-95"
            title="Bốc ngẫu nhiên một từ khác (Phím R)"
          >
            <Shuffle className="w-3 h-3 text-amber-400" />
            <span>Ngẫu nhiên</span>
          </button>

          <button
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-1 px-2.5 sm:px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs sm:text-sm transition-all hover:translate-x-0.5 cursor-pointer shadow-md"
            title="Từ tiếp theo (Phím →)"
          >
            <span>Tiếp theo</span>
            <ChevronRight className="w-3.5 h-3.5 text-stone-950" />
          </button>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="text-center mt-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900/90 border border-stone-800 text-[10px] font-mono text-stone-400 whitespace-nowrap shadow-sm">
            <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-amber-300 font-bold">←</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-amber-300 font-bold">→</kbd>
            <span>đổi từ</span>
            <span className="text-stone-600">•</span>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-amber-300 font-bold">Space</kbd>
            <span>lật thẻ</span>
            <span className="text-stone-600">•</span>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-amber-300 font-bold">R</kbd>
            <span>ngẫu nhiên</span>
            <span className="text-stone-600">•</span>
            <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-amber-300 font-bold">S</kbd>
            <span>phát âm</span>
          </div>
        </div>
      </div>
    </div>
  );
}
