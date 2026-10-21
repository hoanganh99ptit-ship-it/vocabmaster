import { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileEdit,
  Sparkles,
  ChevronRight,
  RotateCcw,
  Volume2,
  Trophy,
  CheckCircle2,
  XCircle,
  Lightbulb,
  HelpCircle,
  Flame,
  ArrowRight,
  Keyboard,
  ListFilter,
  Loader2,
  Layers,
} from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/components/Toast';
import { speak, speedOptions, getGlobalRate, setGlobalRate } from '@/lib/speech';
import { addPracticeRecord } from '@/lib/storage';
import { generateClozeQuestions } from '@/services/geminiService';
import type { Vocabulary, ClozeQuestion } from '@/lib/types';

const QUESTION_COUNTS = [5, 10, 15, 20];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function ClozeTest() {
  const { vocabs, incrementError, updateSRS } = useVocab();
  const { t, lang } = useLanguage();
  const { show } = useToast();

  const [phase, setPhase] = useState<'setup' | 'loading' | 'playing' | 'done'>('setup');
  const [mode, setMode] = useState<'typing' | 'choice'>('typing');
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

  // Focus input automatically when entering new question in typing mode
  useEffect(() => {
    if (phase === 'playing' && mode === 'typing' && !answered) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [phase, mode, current, answered]);

  const handleStart = async () => {
    if (filteredVocabs.length < 1) {
      show(t('clozeEmpty'), 'error');
      return;
    }

    if (mode === 'choice' && vocabs.length < 4) {
      show(t('clozeEmptyChoice'), 'error');
      return;
    }

    setPhase('loading');

    // Pick words for practice (prioritize weak words or random shuffle)
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
      userWon = trimmed === targetWord;
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
      setScore((s) => s + 1);
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > maxStreak) setMaxStreak(newStreak);
      // Play audio of full correct sentence
      speak(currentQ.fullSentence, rate);
    } else {
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

  // Render sentence with interactive/highlighted blank
  const renderSentenceWithBlank = () => {
    if (!currentQ) return null;
    const parts = currentQ.sentenceWithBlank.split('______');
    const before = parts[0] || '';
    const after = parts.slice(1).join('______');

    let blankContent = '______';
    let blankClass = 'text-indigo-600 font-bold border-b-2 border-indigo-400 px-2 py-0.5 mx-1 inline-block';

    if (answered) {
      if (isCorrect) {
        blankContent = currentQ.vocab.word;
        blankClass = 'text-emerald-700 bg-emerald-100 font-bold px-2.5 py-0.5 rounded-lg border border-emerald-300 mx-1 inline-block animate-pulse';
      } else {
        blankContent = `${currentQ.vocab.word}`;
        blankClass = 'text-rose-700 bg-rose-100 font-bold px-2.5 py-0.5 rounded-lg border border-rose-300 mx-1 inline-block line-through';
      }
    } else if (mode === 'typing' && typedAnswer.trim()) {
      blankContent = typedAnswer.trim();
      blankClass = 'text-indigo-700 bg-indigo-50 font-bold px-2.5 py-0.5 rounded-lg border border-indigo-300 mx-1 inline-block';
    }

    return (
      <div className="text-xl sm:text-2xl text-slate-800 leading-relaxed font-medium">
        <span>{before}</span>
        <span className={blankClass}>{blankContent}</span>
        {answered && !isCorrect && (
          <span className="text-emerald-700 bg-emerald-100 font-bold px-2.5 py-0.5 rounded-lg border border-emerald-300 mx-1 inline-block">
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
        <div className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-10 shadow-sm text-center relative overflow-hidden">
          {/* Decorative ambient gradient */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-32 bg-gradient-to-b from-indigo-500/10 to-transparent blur-2xl pointer-events-none" />

          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center mb-5 shadow-md shadow-indigo-500/20">
            <FileEdit className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t('clozeTitle')}
          </h2>
          <p className="text-slate-500 mt-2 text-base max-w-md mx-auto">
            {t('clozeDesc')}
          </p>

          {/* Mode Selector */}
          <div className="mt-8 text-left bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {t('clozeMode')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('typing')}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  mode === 'typing'
                    ? 'border-indigo-600 bg-white shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white/60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mode === 'typing' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">{t('clozeModeTyping')}</div>
                  <div className="text-xs text-slate-500">Gợi nhớ chủ động, gõ từ vào ô trống</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('choice')}
                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                  mode === 'choice'
                    ? 'border-indigo-600 bg-white shadow-sm ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white/60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mode === 'choice' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <ListFilter className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">{t('clozeModeChoice')}</div>
                  <div className="text-xs text-slate-500">Chọn 1 trong 4 đáp án theo ngữ cảnh</div>
                </div>
              </button>
            </div>
          </div>

          {/* Filter Chest */}
          {availableChests.length > 1 && (
            <div className="mt-5 text-left bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                {t('chest')}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedChest('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    selectedChest === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  Tất cả rương ({vocabs.length})
                </button>
                {availableChests.map((cat) => {
                  const countInCat = vocabs.filter((v) => v.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedChest(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        selectedChest === cat
                          ? 'bg-indigo-600 text-white shadow-sm'
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
            <p className="text-sm font-semibold text-slate-600 mb-3">{t('questionCount')}</p>
            <div className="flex gap-2.5 justify-center flex-wrap">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`w-14 h-14 rounded-2xl font-bold text-base transition-all ${
                    count === n
                      ? 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20 scale-105'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
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
            className="mt-8 w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-700 hover:via-indigo-600 hover:to-violet-700 text-white font-bold text-lg shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            <span>{t('startSentence')}</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    );
  }

  // 2. LOADING PHASE (AI GENERATION)
  if (phase === 'loading') {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-4 animate-bounce">
          <Sparkles className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-800">{t('clozeGenerating')}</h3>
        <p className="text-slate-500 text-sm mt-2">{t('clozeGeneratingDesc')}</p>
        <div className="mt-6 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      </div>
    );
  }

  // 3. DONE PHASE (RESULTS)
  if (phase === 'done') {
    const accuracy = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-sm text-center">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-100 text-amber-500 flex items-center justify-center mb-5 shadow-sm">
            <Trophy className="w-10 h-10" />
          </div>

          <h2 className="text-3xl font-extrabold text-slate-800">{t('clozeComplete')}</h2>
          <p className="text-slate-500 mt-1">{t('clozeScore')}</p>

          <div className="my-6 inline-flex items-baseline gap-2 bg-gradient-to-r from-indigo-50 to-violet-50 px-8 py-4 rounded-3xl border border-indigo-100">
            <span className="text-5xl font-black text-indigo-600">{score}</span>
            <span className="text-2xl font-bold text-slate-400">/ {questions.length}</span>
            <span className="text-lg font-bold text-indigo-500 ml-3">({accuracy}%)</span>
          </div>

          {maxStreak > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-amber-600 mb-6">
              <Flame className="w-4 h-4 fill-amber-500" />
              <span>Chuỗi đúng liên tiếp dài nhất: {maxStreak} câu!</span>
            </div>
          )}

          {/* Results Review list */}
          <div className="mt-8 text-left divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden max-h-96 overflow-y-auto">
            {historyResults.map((r, i) => (
              <div key={i} className="p-4 bg-white hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {r.correct ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    )}
                    <span className="font-bold text-slate-800">{r.vocab.word}</span>
                    <span className="text-xs text-slate-400">({r.vocab.meaning})</span>
                  </div>
                  <button
                    onClick={() => speak(r.fullSentence, rate)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title={t('playAudio')}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm text-slate-700 mt-2 font-medium">{r.fullSentence}</div>
                {r.translation && (
                  <div className="text-xs text-slate-400 mt-0.5">{r.translation}</div>
                )}
                {!r.correct && r.userAnswer && (
                  <div className="text-xs text-rose-600 font-semibold mt-1">
                    Bạn đã điền: &quot;{r.userAnswer}&quot;
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-3 justify-center">
            <button
              onClick={() => setPhase('setup')}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold hover:from-indigo-700 hover:to-violet-700 transition-all shadow-md shadow-indigo-500/20"
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
  return (
    <div className="max-w-2xl mx-auto">
      {/* Top Header / Stats */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200">
            {t('question')} {current + 1} / {questions.length}
          </span>
          {streak > 1 && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 animate-pulse">
              <Flame className="w-3.5 h-3.5 fill-amber-500" />
              <span>{streak} Streak!</span>
            </div>
          )}
        </div>

        {/* Speech Speed Setting */}
        <div className="flex items-center gap-1.5">
          <Volume2 className="w-4 h-4 text-slate-400" />
          <select
            value={rate}
            onChange={(e) => {
              const r = parseFloat(e.target.value);
              setRate(r);
              setGlobalRate(r);
            }}
            className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {speedOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200/80 rounded-full h-2 mb-6 overflow-hidden">
        <div
          className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((current + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Main Question Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm relative">
        {/* Category tag */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
              {currentQ.vocab.category || 'General'}
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-xs font-semibold text-slate-500">{currentQ.vocab.type || 'word'}</span>
          </div>

          <button
            onClick={() => setShowHint(!showHint)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
              showHint ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>{showHint ? t('clozeHintActive') : t('clozeHint')}</span>
          </button>
        </div>

        {/* Hint Accordion */}
        {showHint && (
          <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200/70 text-amber-900 text-xs sm:text-sm animate-fadeIn">
            <div className="font-semibold flex items-center gap-1.5 mb-1">
              <Lightbulb className="w-4 h-4 text-amber-600" />
              <span>{t('clozeMeaningLabel')}: {currentQ.vocab.meaning}</span>
            </div>
            <div className="text-amber-700">
              {t('clozeFirstLetter')}: <strong className="uppercase">{currentQ.vocab.word.charAt(0)}...</strong> ({currentQ.vocab.word.length} {t('letters')})
            </div>
          </div>
        )}

        {/* The Sentence with Blank */}
        <div className="my-6 p-6 rounded-2xl bg-slate-50/80 border border-slate-100 relative">
          {renderSentenceWithBlank()}

          {/* Full Sentence Audio & Translation (when answered) */}
          {answered && (
            <div className="mt-4 pt-3 border-t border-slate-200/60 space-y-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => speak(currentQ.fullSentence, rate)}
                  className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-colors shadow-sm"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{t('clozeListenFull')}</span>
                </button>
              </div>
              {currentQ.translation && (
                <div className="text-sm text-slate-700 italic bg-white/80 p-3 rounded-xl border border-slate-200/70 leading-relaxed shadow-xs">
                  <span className="font-semibold text-slate-800 not-italic mr-1.5">Dịch nghĩa câu:</span>
                  {currentQ.translation}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Mechanism: Mode Typing vs Choice */}
        {!answered ? (
          mode === 'typing' ? (
            <div className="mt-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCheck();
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  placeholder={t('clozeTypePlaceholder')}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  className="flex-1 px-4 py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-900 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
                />
                <button
                  type="submit"
                  disabled={!typedAnswer.trim()}
                  className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-500/20 transition-all disabled:opacity-40"
                >
                  {t('clozeCheck')}
                </button>
              </form>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQ.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleCheck(idx)}
                  className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50/40 text-left transition-all font-bold text-slate-800 shadow-sm hover:shadow"
                >
                  <span className="text-base">{opt}</span>
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-bold">
                    {String.fromCharCode(65 + idx)}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          /* Post-Answer Feedback Banner & Next Button */
          <div className="mt-6">
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between ${
                isCorrect
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-3">
                {isCorrect ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                ) : (
                  <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0" />
                )}
                <div>
                  <div className="font-bold text-sm">
                    {isCorrect ? t('correct') + '! 🎉' : `${t('incorrect')}! Đáp án đúng: "${currentQ.vocab.word}"`}
                  </div>
                  <div className="text-xs opacity-80 mt-0.5">
                    Nghĩa: {currentQ.vocab.meaning}
                  </div>
                </div>
              </div>

              <button
                onClick={handleNext}
                autoFocus
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-black transition-all shadow-sm"
              >
                <span>{t('clozeNext')}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
