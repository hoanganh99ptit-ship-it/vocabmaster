import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles,
  ChevronRight,
  RotateCcw,
  Volume2,
  VolumeX,
  Trophy,
  CheckCircle2,
  XCircle,
  Lightbulb,
  Flame,
  ArrowRight,
  Keyboard,
  ListFilter,
  Loader2,
  Layers,
} from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/components/Toast';
import { speak, speedOptions, getGlobalRate, setGlobalRate } from '@/lib/speech';
import { addPracticeRecord } from '@/lib/storage';
import {
  playCorrectSound,
  playIncorrectSound,
  playCelebrationSound,
  isSoundEnabled,
  toggleSound,
} from '@/lib/soundEffects';
import { generateClozeQuestions } from '@/services/geminiService';
import type { Vocabulary, ClozeQuestion } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';

const QUESTION_COUNTS = [5, 10, 15, 20];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[j], copy[i]] = [copy[i], copy[j]];
  }
  return copy;
}

// Resilient parsing of blank in sentence (Module scope)
function parseSentenceParts(sentenceWithBlank: string, fullSentence: string, targetWord: string) {
  // 1. Match standard blank or underscore sequence (3 or more underscores, or [blank], <blank>)
  const blankRegex = /(?:_{3,}|\[blank\]|<blank>|\(\.{3,}\)|\.{3,})/i;
  const match = sentenceWithBlank.match(blankRegex);
  if (match && match.index !== undefined) {
    return {
      before: sentenceWithBlank.slice(0, match.index),
      after: sentenceWithBlank.slice(match.index + match[0].length),
    };
  }

  // 2. If no blank placeholder was found in sentenceWithBlank, try matching targetWord (case-insensitive, whole word)
  const escapedWord = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
  const wordMatch = sentenceWithBlank.match(wordRegex);
  if (wordMatch && wordMatch.index !== undefined) {
    return {
      before: sentenceWithBlank.slice(0, wordMatch.index),
      after: sentenceWithBlank.slice(wordMatch.index + wordMatch[0].length),
    };
  }

  // 3. Fallback: try checking fullSentence for the targetWord
  const fullWordMatch = fullSentence.match(wordRegex);
  if (fullWordMatch && fullWordMatch.index !== undefined) {
    return {
      before: fullSentence.slice(0, fullWordMatch.index),
      after: fullSentence.slice(fullWordMatch.index + fullWordMatch[0].length),
    };
  }

  // 4. Default: split by '______'
  const parts = sentenceWithBlank.split('______');
  return {
    before: parts[0] || '',
    after: parts.slice(1).join('______'),
  };
}

export function ClozeTest() {
  const { vocabs, incrementError, updateSRS } = useVocab();
  const { t, lang } = useLanguage();
  const { theme } = useTheme();
  const { show } = useToast();

  const [phase, setPhase] = useState<'setup' | 'loading' | 'playing' | 'done'>('setup');
  const [mode, setMode] = useState<'choice' | 'typing'>('choice');
  const [count, setCount] = useState(10);
  const [selectedChest, setSelectedChest] = useState<string>('ALL');

  const [questions, setQuestions] = useState<ClozeQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [rate, setRate] = useState(getGlobalRate());
  const [sfxOn, setSfxOn] = useState(() => isSoundEnabled());

  useEffect(() => {
    const handleSfxChange = (e: Event) => {
      const ce = e as CustomEvent<{ enabled: boolean }>;
      setSfxOn(ce.detail?.enabled ?? isSoundEnabled());
    };
    window.addEventListener('vocabmaster_sfx_toggle', handleSfxChange);
    return () => window.removeEventListener('vocabmaster_sfx_toggle', handleSfxChange);
  }, []);

  const [historyResults, setHistoryResults] = useState<
    Array<{
      vocab: Vocabulary;
      correct: boolean;
      fullSentence: string;
      sentenceWithBlank: string;
      userAnswer: string;
      translation: string;
    }>
  >([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Available unique chests
  const availableChests = useMemo(() => {
    const set = new Set<string>();
    vocabs.forEach((v) => {
      if (v.category) set.add(v.category);
    });
    return Array.from(set);
  }, [vocabs]);

  // Filtered vocabs by chest
  const filteredVocabs = useMemo(() => {
    if (selectedChest === 'ALL') return vocabs;
    return vocabs.filter((v) => v.category === selectedChest);
  }, [vocabs, selectedChest]);

  // Current active question
  const currentQ = questions[current];

  // Submit Answer (for either typing or choice)
  const handleCheck = (choiceIdx?: number) => {
    if (answered || !currentQ) return;

    let userWon = false;
    let finalAnswer = '';

    if (mode === 'typing') {
      const trimmed = typedAnswer.trim().toLowerCase();
      if (!trimmed) return;
      finalAnswer = trimmed;
      const targetWord = currentQ.vocab.word.trim().toLowerCase();
      // Smart check: exact match, or stripped trailing punctuation, or without leading 'to '
      const cleanTyped = trimmed.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '').trim();
      const cleanTarget = targetWord.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, '').trim();
      const withoutToTarget = cleanTarget.replace(/^to\s+/, '').trim();
      const withoutToTyped = cleanTyped.replace(/^to\s+/, '').trim();

      userWon = (
        cleanTyped === cleanTarget ||
        cleanTyped === withoutToTarget ||
        withoutToTyped === withoutToTarget
      );
    } else {
      const picked = choiceIdx !== undefined ? choiceIdx : selectedChoice;
      if (picked === null || picked === undefined) return;
      setSelectedChoice(picked);
      finalAnswer = currentQ.options[picked] || '';
      userWon = picked === currentQ.correctIndex;
    }

    setAnswered(true);
    setIsCorrect(userWon);

    if (userWon) {
      playCorrectSound();
      setScore((s) => s + 1);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > maxStreak) setMaxStreak(newStreak);
      // Play audio of full correct sentence
      speak(currentQ.fullSentence, rate);
    } else {
      playIncorrectSound();
      setStreak(0);
      incrementError(currentQ.vocab.word);
    }

    // Update SRS
    updateSRS(currentQ.vocab.id, userWon ? 4 : 1);

    // Save to practice records
    addPracticeRecord({
      type: 'cloze',
      vocabId: currentQ.vocab.id,
      word: currentQ.vocab.word,
      correct: userWon,
      timestamp: Date.now(),
    });

    setHistoryResults((prev) => [
      ...prev,
      {
        vocab: currentQ.vocab,
        correct: userWon,
        fullSentence: currentQ.fullSentence,
        sentenceWithBlank: currentQ.sentenceWithBlank,
        userAnswer: finalAnswer,
        translation: currentQ.translation,
      },
    ]);
  };

  const handleNext = () => {
    if (current + 1 >= questions.length) {
      playCelebrationSound();
      setPhase('done');
    } else {
      setCurrent((c) => c + 1);
      setTypedAnswer('');
      setSelectedChoice(null);
      setAnswered(false);
      setIsCorrect(null);
      setShowHint(false);
    }
  };

  const handleStart = async () => {
    if (filteredVocabs.length < 1) {
      show(t('clozeEmpty'), 'error');
      return;
    }

    setPhase('loading');

    const targetCount = Math.min(count, filteredVocabs.length);
    const chosenVocabs = shuffle(filteredVocabs).slice(0, targetCount);

    try {
      const generated = await generateClozeQuestions(chosenVocabs, vocabs);
      if (generated.length === 0) {
        show(t('clozeEmpty'), 'error');
        setPhase('setup');
        return;
      }

      setQuestions(generated);
      setCurrent(0);
      setTypedAnswer('');
      setSelectedChoice(null);
      setAnswered(false);
      setIsCorrect(null);
      setScore(0);
      setStreak(0);
      setMaxStreak(0);
      setShowHint(false);
      setHistoryResults([]);
      setPhase('playing');
    } catch {
      show(t('errGeneric'), 'error');
      setPhase('setup');
    }
  };

  // Focus input automatically when entering new question in typing mode
  useEffect(() => {
    if (phase === 'playing' && mode === 'typing' && !answered) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [phase, mode, current, answered]);

  // Keyboard navigation for fast interactive practice
  useEffect(() => {
    if (phase !== 'playing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is currently typing in the input, don't hijack unless it's Enter
      if (mode === 'typing' && !answered) {
        return;
      }

      // If answered: Enter or Space proceeds to the next question
      if (answered && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleNext();
        return;
      }

      // In choice mode and not yet answered: 1-4 or A-D picks choice
      if (mode === 'choice' && !answered && currentQ) {
        const key = e.key.toUpperCase();
        let idx = -1;
        if (key === '1' || key === 'A') idx = 0;
        else if (key === '2' || key === 'B') idx = 1;
        else if (key === '3' || key === 'C') idx = 2;
        else if (key === '4' || key === 'D') idx = 3;

        if (idx >= 0 && idx < currentQ.options.length) {
          e.preventDefault();
          handleCheck(idx);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, mode, answered, currentQ, current, questions.length]);

  // Render sentence with interactive/highlighted blank
  const renderSentenceWithBlank = () => {
    if (!currentQ) return null;
    const { before, after } = parseSentenceParts(
      currentQ.sentenceWithBlank,
      currentQ.fullSentence,
      currentQ.vocab.word
    );

    let blankContent = '______';
    let blankClass =
      theme === 'cinema'
        ? 'text-amber-400 font-bold border-b-2 border-amber-400 px-2.5 py-0.5 mx-1 inline-block tracking-widest'
        : 'text-sky-600 font-bold border-b-2 border-sky-500 px-2.5 py-0.5 mx-1 inline-block tracking-widest';

    if (answered) {
      if (isCorrect) {
        blankContent = currentQ.vocab.word;
        blankClass =
          theme === 'cinema'
            ? 'text-emerald-300 bg-emerald-950/70 font-bold px-3 py-0.5 rounded-lg border border-emerald-500/60 mx-1 inline-block animate-pulse'
            : 'text-emerald-700 bg-emerald-100 font-bold px-3 py-0.5 rounded-lg border border-emerald-300 mx-1 inline-block animate-pulse';
      } else {
        const userWord =
          mode === 'typing'
            ? typedAnswer.trim() || '...'
            : selectedChoice !== null
            ? currentQ.options[selectedChoice] || '...'
            : '...';
        blankContent = userWord;
        blankClass =
          theme === 'cinema'
            ? 'text-rose-400 bg-rose-950/70 font-bold px-3 py-0.5 rounded-lg border border-rose-500/60 mx-1 inline-block line-through'
            : 'text-rose-700 bg-rose-100 font-bold px-3 py-0.5 rounded-lg border border-rose-300 mx-1 inline-block line-through';
      }
    } else if (mode === 'typing' && typedAnswer.trim()) {
      blankContent = typedAnswer.trim();
      blankClass =
        theme === 'cinema'
          ? 'text-amber-300 bg-amber-950/40 font-bold px-2.5 py-0.5 rounded-lg border border-amber-500/50 mx-1 inline-block'
          : 'text-sky-700 bg-sky-50 font-bold px-2.5 py-0.5 rounded-lg border border-sky-300 mx-1 inline-block';
    }

    return (
      <div
        className={`text-xl sm:text-2xl leading-relaxed font-medium ${
          theme === 'cinema' ? 'text-[#fffbeb]' : 'text-slate-800'
        }`}
      >
        <span>{before}</span>
        <span className={blankClass}>{blankContent}</span>
        {answered && !isCorrect && (
          <span
            className={
              theme === 'cinema'
                ? 'text-emerald-300 bg-emerald-950/70 font-bold px-3 py-0.5 rounded-lg border border-emerald-500/60 mx-1 inline-block'
                : 'text-emerald-700 bg-emerald-100 font-bold px-3 py-0.5 rounded-lg border border-emerald-300 mx-1 inline-block'
            }
          >
            {currentQ.vocab.word}
          </span>
        )}
        <span>{after}</span>
      </div>
    );
  };

  // 1. SETUP PHASE
  if (phase === 'setup') {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          className={`rounded-2xl border p-8 shadow-sm text-center relative overflow-hidden ${
            theme === 'cinema'
              ? 'bg-[#18130e] border-amber-500/35 text-amber-100 shadow-xl shadow-black/40'
              : 'bg-white border-slate-200'
          }`}
        >
          <div
            className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
              theme === 'cinema'
                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                : 'bg-sky-100 text-sky-500'
            }`}
          >
            <Layers className="w-8 h-8" />
          </div>

          <h2
            className={`text-2xl font-bold ${
              theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
            }`}
          >
            {t('clozeTitle')}
          </h2>
          <p
            className={`mt-1 ${
              theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
            }`}
          >
            {t('clozeDesc')}
          </p>

          {/* Mode Selector */}
          <div
            className={`mt-8 text-left rounded-xl p-4 border ${
              theme === 'cinema'
                ? 'bg-[#15100c] border-amber-600/30'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              {t('clozeMode')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('choice')}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  mode === 'choice'
                    ? theme === 'cinema'
                      ? 'border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500/30'
                      : 'border-sky-500 bg-white shadow-sm ring-2 ring-sky-500/20'
                    : theme === 'cinema'
                    ? 'border-amber-500/20 bg-stone-900/60 hover:border-amber-500/40 text-stone-300'
                    : 'border-slate-200 hover:border-slate-300 bg-white/60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mode === 'choice'
                      ? theme === 'cinema'
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-sky-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <ListFilter className="w-5 h-5" />
                </div>
                <div>
                  <div
                    className={`font-bold text-sm ${
                      theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
                    }`}
                  >
                    {t('clozeModeChoice')}
                  </div>
                  <div
                    className={`text-xs ${
                      theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
                    }`}
                  >
                    {lang === 'vi' ? 'Chọn 1 trong 4 đáp án theo ngữ cảnh (Phím 1-4/A-D)' : 'Pick 1 of 4 choices in context (Keys 1-4/A-D)'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('typing')}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  mode === 'typing'
                    ? theme === 'cinema'
                      ? 'border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500/30'
                      : 'border-sky-500 bg-white shadow-sm ring-2 ring-sky-500/20'
                    : theme === 'cinema'
                    ? 'border-amber-500/20 bg-stone-900/60 hover:border-amber-500/40 text-stone-300'
                    : 'border-slate-200 hover:border-slate-300 bg-white/60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mode === 'typing'
                      ? theme === 'cinema'
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-sky-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <div
                    className={`font-bold text-sm ${
                      theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
                    }`}
                  >
                    {t('clozeModeTyping')}
                  </div>
                  <div
                    className={`text-xs ${
                      theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
                    }`}
                  >
                    {lang === 'vi' ? 'Gợi nhớ chủ động, gõ từ vào ô trống (Enter chuyển câu)' : 'Type the missing word from memory (Enter for next)'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Filter Chest */}
          {availableChests.length > 1 && (
            <div
              className={`mt-4 text-left rounded-xl p-4 border ${
                theme === 'cinema'
                  ? 'bg-[#15100c] border-amber-600/30'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                {t('chest')}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedChest('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedChest === 'ALL'
                      ? theme === 'cinema'
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : 'bg-sky-500 text-white shadow-xs'
                      : theme === 'cinema'
                      ? 'bg-stone-900/80 border border-amber-500/20 text-stone-300 hover:border-amber-500/40'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {lang === 'vi' ? 'Tất cả rương' : 'All chests'} ({vocabs.length})
                </button>
                {availableChests.map((cat) => {
                  const countInCat = vocabs.filter((v) => v.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedChest(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        selectedChest === cat
                          ? theme === 'cinema'
                            ? 'bg-amber-500 text-stone-950 font-bold'
                            : 'bg-sky-500 text-white shadow-xs'
                          : theme === 'cinema'
                          ? 'bg-stone-900/80 border border-amber-500/20 text-stone-300 hover:border-amber-500/40'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {cat} ({countInCat})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Question Count Selection */}
          <div className="mt-6">
            <p
              className={`text-sm font-semibold mb-3 ${
                theme === 'cinema' ? 'text-stone-300' : 'text-slate-600'
              }`}
            >
              {t('questionCount')}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`w-16 h-16 rounded-2xl font-bold text-lg transition-all cursor-pointer ${
                    count === n
                      ? theme === 'cinema'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 shadow-md shadow-amber-500/20 font-black'
                        : 'bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-md shadow-sky-500/20'
                      : theme === 'cinema'
                      ? 'bg-stone-900 border border-amber-500/30 text-amber-200 hover:bg-stone-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Start CTA */}
          <button
            onClick={handleStart}
            disabled={filteredVocabs.length === 0}
            className={`mt-8 px-8 py-3.5 rounded-xl font-semibold transition-all shadow-md disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 font-bold hover:from-amber-400 hover:to-yellow-400 shadow-amber-500/20'
                : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600 shadow-sky-500/20'
            }`}
          >
            <span>{lang === 'vi' ? 'Bắt đầu đục lỗ' : 'Start Cloze Test'}</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // 2. LOADING PHASE (AI GENERATION)
  if (phase === 'loading') {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div
          className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 animate-bounce ${
            theme === 'cinema'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'bg-sky-100 text-sky-600'
          }`}
        >
          <Sparkles className="w-8 h-8" />
        </div>
        <h3
          className={`text-xl font-bold ${
            theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
          }`}
        >
          {t('clozeGenerating')}
        </h3>
        <p
          className={`text-sm mt-2 ${
            theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
          }`}
        >
          {t('clozeGeneratingDesc')}
        </p>
        <div className="mt-6 flex justify-center">
          <Loader2
            className={`w-6 h-6 animate-spin ${
              theme === 'cinema' ? 'text-amber-500' : 'text-sky-500'
            }`}
          />
        </div>
      </div>
    );
  }

  // 3. DONE PHASE (RESULTS)
  if (phase === 'done') {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-2xl mx-auto">
        <div
          className={`rounded-2xl p-8 shadow-sm text-center border ${
            theme === 'cinema'
              ? 'bg-[#18130e] border-amber-500/35 text-amber-100 shadow-xl shadow-black/40'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center mb-4 shadow-md">
            <Trophy className="w-10 h-10 text-white" />
          </div>

          <h2
            className={`text-2xl font-bold ${
              theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
            }`}
          >
            {t('clozeComplete')}
          </h2>
          <p
            className={`mt-1 ${
              theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
            }`}
          >
            {t('clozeScore')}
          </p>

          <div className="mt-6 flex items-center justify-center gap-8">
            <div>
              <p
                className={`text-4xl font-bold ${
                  theme === 'cinema' ? 'text-amber-400' : 'text-sky-600'
                }`}
              >
                {score}
              </p>
              <p
                className={`text-sm ${
                  theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
                }`}
              >
                {t('correct')}
              </p>
            </div>
            <div
              className={`w-px h-12 ${
                theme === 'cinema' ? 'bg-amber-500/20' : 'bg-slate-200'
              }`}
            />
            <div>
              <p
                className={`text-4xl font-bold ${
                  theme === 'cinema' ? 'text-stone-500' : 'text-slate-400'
                }`}
              >
                {questions.length - score}
              </p>
              <p
                className={`text-sm ${
                  theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
                }`}
              >
                {t('incorrect')}
              </p>
            </div>
            <div
              className={`w-px h-12 ${
                theme === 'cinema' ? 'bg-amber-500/20' : 'bg-slate-200'
              }`}
            />
            <div>
              <p
                className={`text-4xl font-bold ${
                  theme === 'cinema' ? 'text-amber-400' : 'text-teal-600'
                }`}
              >
                {percentage}%
              </p>
              <p
                className={`text-sm ${
                  theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
                }`}
              >
                {t('score')}
              </p>
            </div>
          </div>

          {maxStreak > 1 && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-amber-500 mt-4">
              <Flame className="w-4 h-4 fill-amber-500" />
              <span>
                {lang === 'vi'
                  ? `Chuỗi đúng dài nhất: ${maxStreak} câu liên tiếp!`
                  : `Best streak: ${maxStreak} in a row!`}
              </span>
            </div>
          )}

          {/* Results Review list */}
          <div
            className={`mt-8 text-left divide-y border rounded-xl overflow-hidden max-h-96 overflow-y-auto ${
              theme === 'cinema'
                ? 'divide-amber-500/15 border-amber-500/25 bg-[#140f0c]'
                : 'divide-slate-100 border-slate-200'
            }`}
          >
            {historyResults.map((r, i) => (
              <div
                key={i}
                className={`p-4 transition-colors ${
                  theme === 'cinema'
                    ? 'bg-[#18130e] hover:bg-[#201912]'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {r.correct ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    )}
                    <span
                      className={`font-bold ${
                        theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
                      }`}
                    >
                      {r.vocab.word}
                    </span>
                    <span
                      className={`text-xs ${
                        theme === 'cinema' ? 'text-stone-400' : 'text-slate-400'
                      }`}
                    >
                      ({r.vocab.meaning})
                    </span>
                  </div>
                  <button
                    onClick={() => speak(r.fullSentence, rate)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      theme === 'cinema'
                        ? 'text-stone-400 hover:text-amber-300 hover:bg-amber-500/20'
                        : 'text-slate-400 hover:text-sky-600 hover:bg-sky-50'
                    }`}
                    title={t('playAudio')}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <div
                  className={`text-sm mt-2 font-medium ${
                    theme === 'cinema' ? 'text-stone-200' : 'text-slate-700'
                  }`}
                >
                  {r.fullSentence}
                </div>
                {r.translation && (
                  <div className="text-xs text-slate-400 mt-0.5">{r.translation}</div>
                )}
                {!r.correct && r.userAnswer && (
                  <div className="text-xs text-rose-600 font-semibold mt-1">
                    {lang === 'vi' ? 'Bạn đã chọn/điền:' : 'You answered:'} &quot;{r.userAnswer}&quot;
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-3 justify-center">
            <button
              onClick={() => setPhase('setup')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-md cursor-pointer ${
                theme === 'cinema'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 hover:from-amber-400 hover:to-yellow-400 font-bold'
                  : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              {t('clozeRetry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. PLAYING PHASE
  const progress = ((current + 1) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Top Header / Stats */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-semibold ${
                theme === 'cinema' ? 'text-stone-300' : 'text-slate-600'
              }`}
            >
              {t('question')} {current + 1} {t('of')} {questions.length}
            </span>
            {streak > 1 && (
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                  theme === 'cinema'
                    ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                } animate-pulse`}
              >
                <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span>{streak} Streak!</span>
              </span>
            )}
          </div>

          {/* Audio Speed & SFX Settings */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-slate-400" />
              <select
                value={rate}
                onChange={(e) => {
                  const r = parseFloat(e.target.value);
                  setRate(r);
                  setGlobalRate(r);
                }}
                className={`text-xs font-medium rounded-lg px-2 py-1 focus:outline-none cursor-pointer border ${
                  theme === 'cinema'
                    ? 'text-amber-200 bg-stone-900 border-amber-500/30 focus:ring-2 focus:ring-amber-400'
                    : 'text-slate-600 bg-slate-100 border-slate-200 focus:ring-2 focus:ring-sky-400'
                }`}
              >
                {speedOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.key as TranslationKey)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = toggleSound();
                setSfxOn(next);
              }}
              className={`h-7 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                sfxOn
                  ? (theme === 'cinema'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100')
                  : (theme === 'cinema'
                      ? 'bg-stone-900 text-stone-500 border-stone-800 hover:text-stone-300'
                      : 'bg-slate-100 text-slate-400 border-slate-200 hover:text-slate-600')
              }`}
              title={sfxOn ? 'Âm thanh hiệu ứng: BẬT (Click để tắt)' : 'Âm thanh hiệu ứng: TẮT (Click để bật)'}
            >
              {sfxOn ? <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
              <span>{sfxOn ? 'SFX' : 'Mute'}</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div
          className={`h-2 rounded-full overflow-hidden ${
            theme === 'cinema' ? 'bg-stone-800' : 'bg-slate-200'
          }`}
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                : theme === 'retro'
                ? 'bg-gradient-to-r from-amber-600 to-orange-500'
                : 'bg-gradient-to-r from-sky-500 to-teal-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main Question Card */}
      <div
        className={`rounded-2xl p-6 sm:p-8 shadow-sm border ${
          theme === 'cinema'
            ? 'bg-[#18130e] border-amber-500/35 shadow-xl shadow-black/40'
            : 'bg-white border-slate-200'
        }`}
      >
        {/* Category tag & Hint Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {currentQ.vocab.category || 'General'}
            </span>
            <span className="text-xs text-slate-300">•</span>
            {currentQ.vocab.type && (
              <span
                className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  theme === 'cinema'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-sky-50 border-sky-100 text-sky-600'
                }`}
              >
                {currentQ.vocab.type}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowHint(!showHint)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
              showHint
                ? theme === 'cinema'
                  ? 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                  : 'bg-amber-100 border-amber-300 text-amber-800'
                : theme === 'cinema'
                ? 'bg-stone-900/80 border-amber-500/20 text-stone-300 hover:text-amber-200 hover:border-amber-500/40'
                : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            <span>{showHint ? t('clozeHintActive') : t('clozeHint')}</span>
          </button>
        </div>

        {/* Hint Box */}
        {showHint && (
          <div
            className={`mb-6 p-4 rounded-xl border text-xs sm:text-sm animate-fade-in ${
              theme === 'cinema'
                ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
                : 'bg-amber-50/90 border-amber-200 text-amber-900'
            }`}
          >
            {/* Show rich contextual hint if available from AI */}
            {currentQ.hint && currentQ.hint.trim() !== currentQ.vocab.meaning.trim() && (
              <div className="font-medium mb-2.5 pb-2 border-b border-amber-500/20 flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="text-amber-500 font-semibold">
                    {lang === 'vi' ? 'Gợi ý ngữ cảnh: ' : 'Contextual clue: '}
                  </strong>
                  {currentQ.hint}
                </span>
              </div>
            )}
            <div className="font-semibold flex items-center gap-1.5 mb-1.5">
              <span className="text-amber-500 font-bold">•</span>
              <span>
                {t('clozeMeaningLabel')}:{' '}
                <strong className="text-sm sm:text-base">{currentQ.vocab.meaning}</strong>
              </span>
            </div>
            <div className="opacity-90 pl-3">
              {t('clozeFirstLetter')}:{' '}
              <strong className="uppercase font-mono text-sm sm:text-base">
                {currentQ.vocab.word.charAt(0)}...
              </strong>{' '}
              ({currentQ.vocab.word.length} {t('letters')})
            </div>
          </div>
        )}

        {/* The Sentence with Blank (Designed with Perfect Contrast) */}
        <div
          className={`my-6 p-6 sm:p-7 rounded-2xl border transition-all ${
            theme === 'cinema'
              ? 'bg-[#15100c] border-amber-600/35 shadow-inner'
              : theme === 'retro'
              ? 'bg-[#fbf6ee] border-[#ebdccb]'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          {renderSentenceWithBlank()}

          {/* Full Sentence Audio & Translation & Word Meaning (when answered) */}
          {answered && (
            <div className="mt-5 pt-4 border-t border-slate-200/40 space-y-3 animate-fade-in">
              {/* Target Word Meaning Showcase */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  theme === 'cinema'
                    ? 'bg-amber-950/40 border-amber-500/35 text-amber-100'
                    : theme === 'retro'
                    ? 'bg-amber-50 border-amber-200 text-stone-900'
                    : 'bg-emerald-50/80 border-emerald-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                    {lang === 'vi' ? 'Nghĩa của từ:' : 'Word meaning:'}
                  </span>
                  <span
                    className={`text-base font-bold ${
                      theme === 'cinema' ? 'text-amber-300' : 'text-slate-900'
                    }`}
                  >
                    {currentQ.vocab.word}
                  </span>
                  {currentQ.vocab.type && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white/20 border border-current/20">
                      {currentQ.vocab.type}
                    </span>
                  )}
                  <span className="text-slate-400">•</span>
                  <span
                    className={`text-sm font-bold ${
                      theme === 'cinema' ? 'text-emerald-300' : 'text-emerald-700'
                    }`}
                  >
                    {currentQ.vocab.meaning}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => speak(currentQ.vocab.word, rate)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      theme === 'cinema'
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                    title={lang === 'vi' ? 'Phát âm từ vựng' : 'Pronounce word'}
                  >
                    <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>{currentQ.vocab.word}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => speak(currentQ.fullSentence, rate)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      theme === 'cinema'
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                        : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                    }`}
                    title={lang === 'vi' ? 'Phát âm cả câu' : 'Pronounce sentence'}
                  >
                    <Volume2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>{t('clozeListenFull')}</span>
                  </button>
                </div>
              </div>

              {/* Sentence Translation */}
              {currentQ.translation && (
                <div
                  className={`text-sm p-3.5 rounded-xl border leading-relaxed ${
                    theme === 'cinema'
                      ? 'bg-stone-900/80 border-amber-500/25 text-stone-200'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="font-semibold text-amber-500 mr-2">
                    {lang === 'vi' ? 'Dịch nghĩa câu:' : 'Sentence Translation:'}
                  </span>
                  {currentQ.translation}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Interaction: Mode Typing vs Choice */}
        {mode === 'typing' ? (
          <div className="mt-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!answered) handleCheck();
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                disabled={answered}
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                placeholder={t('clozeTypePlaceholder')}
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                className={`flex-1 px-4 py-3.5 rounded-xl border text-base font-semibold focus:outline-none focus:ring-2 transition-all ${
                  answered
                    ? isCorrect
                      ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400'
                      : 'border-rose-500 bg-rose-950/20 text-rose-400'
                    : theme === 'cinema'
                    ? 'border-amber-500/30 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                    : 'border-slate-200 bg-white text-slate-900 focus:ring-sky-400'
                }`}
              />
              {!answered && (
                <button
                  type="submit"
                  disabled={!typedAnswer.trim()}
                  className={`px-6 py-3.5 rounded-xl font-semibold shadow-md transition-all disabled:opacity-40 cursor-pointer ${
                    theme === 'cinema'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 font-bold hover:from-amber-400 hover:to-yellow-400'
                      : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600'
                  }`}
                >
                  {t('clozeCheck')}
                </button>
              )}
            </form>
          </div>
        ) : (
          /* Choice Mode: Synchronized exactly with Quiz.tsx */
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentQ.options.map((option, idx) => {
              const isCorrectOpt = idx === currentQ.correctIndex;
              const isSelectedOpt = idx === selectedChoice;

              let style = theme === 'cinema'
                ? 'border-amber-500/30 bg-stone-900/80 hover:border-amber-400 hover:bg-stone-800 text-amber-100'
                : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50 text-slate-700';

              if (answered) {
                if (isCorrectOpt) {
                  style = theme === 'cinema'
                    ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
                    : 'border-emerald-400 bg-emerald-50 text-emerald-700';
                } else if (isSelectedOpt) {
                  style = theme === 'cinema'
                    ? 'border-rose-500 bg-rose-950/60 text-rose-200'
                    : 'border-rose-400 bg-rose-50 text-rose-700';
                } else {
                  style = theme === 'cinema'
                    ? 'border-amber-500/20 bg-stone-900/40 text-stone-600 opacity-50'
                    : 'border-slate-200 bg-white text-slate-400 opacity-50';
                }
              }

              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between px-5 py-4 rounded-xl border-2 font-semibold transition-all ${style}`}
                >
                  <button
                    type="button"
                    onClick={() => handleCheck(idx)}
                    disabled={answered}
                    className="flex-1 text-left cursor-pointer"
                  >
                    <span className="text-base">{option}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(option, rate);
                      }}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer ${
                        theme === 'cinema'
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                          : 'bg-sky-50 hover:bg-sky-100 text-sky-500'
                      }`}
                      title={t('playAudio')}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>

                    {answered && isCorrectOpt && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    )}
                    {answered && isSelectedOpt && !isCorrectOpt && (
                      <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    )}

                    {!answered && (
                      <span
                        className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                          theme === 'cinema'
                            ? 'bg-stone-800 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Next Question / Finish Button (Consistent with Quiz.tsx) */}
        {answered && (
          <button
            onClick={handleNext}
            autoFocus
            className={`mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all shadow-md animate-fade-in cursor-pointer ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-black hover:from-amber-500 hover:to-amber-400'
                : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600'
            }`}
          >
            <span>{current + 1 >= questions.length ? t('finishQuiz') : t('clozeNext')}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
