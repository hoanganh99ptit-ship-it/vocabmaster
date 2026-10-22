import { useState, useRef, useEffect } from 'react';
import { Keyboard, CheckCircle2, XCircle, RotateCcw, ChevronRight, Lightbulb, Trophy, Volume2 } from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/components/Toast';
import { speak, speedOptions, getGlobalRate, setGlobalRate } from '@/lib/speech';
import { addPracticeRecord } from '@/lib/storage';
import type { Vocabulary } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';

const QUESTION_COUNTS = [5, 10, 15, 20];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// Compute the initial set of revealed indices for a word
function initialRevealedIndices(word: string): Set<number> {
  const chars = word.split('');
  const len = chars.length;
  const indices = new Set<number>();

  if (len <= 4) {
    indices.add(0);
    return indices;
  }

  // Always reveal first and last letter
  indices.add(0);
  indices.add(len - 1);

  if (len <= 8) {
    // Medium: also reveal the middle letter
    indices.add(Math.floor(len / 2));
    return indices;
  }

  // Long (9+): reveal first vowel after position 0
  for (let i = 1; i < len - 1; i++) {
    if (VOWELS.has(chars[i].toLowerCase())) {
      indices.add(i);
      break;
    }
  }

  return indices;
}

export function TypingTest() {
  const { vocabs, incrementError, updateSRS } = useVocab();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { show } = useToast();

  const [phase, setPhase] = useState<'setup' | 'playing' | 'done'>('setup');
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<Vocabulary[]>([]);
  const [current, setCurrent] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const [hintPenaltyApplied, setHintPenaltyApplied] = useState(false);
  const [rate, setRate] = useState(getGlobalRate());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase === 'playing' && result === null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, result, current]);

  const start = () => {
    if (vocabs.length < 1) {
      show(t('notEnoughWordsTyping'), 'error');
      return;
    }
    const qs = shuffle(vocabs).slice(0, Math.min(count, vocabs.length));
    setQuestions(qs);
    setCurrent(0);
    setInput('');
    setResult(null);
    setScore(0);
    setShowHint(false);
    setRevealedIndices(new Set());
    setHintPenaltyApplied(false);
    setPhase('playing');
  };

  const handleCheck = () => {
    if (!input.trim() || result !== null) return;
    const correct = input.trim().toLowerCase() === questions[current].word.toLowerCase();
    let finalScore = score;
    if (correct) {
      finalScore = score + 1;
      if (hintPenaltyApplied) finalScore = Math.max(0, finalScore - 0.5);
      setScore(finalScore);
      speak(questions[current].word, rate);
    } else {
      incrementError(questions[current].word);
    }
    setResult(correct ? 'correct' : 'incorrect');

    // Update Spaced Repetition (SRS)
    const quality = correct ? (hintPenaltyApplied || showHint ? 3 : 5) : 1;
    updateSRS(questions[current].id, quality);

    addPracticeRecord({
      type: 'typing',
      vocabId: questions[current].id,
      word: questions[current].word,
      correct,
      timestamp: Date.now(),
    });
  };

  const toggleHint = () => {
    if (!showHint) {
      // First time showing hint: initialize revealed indices
      setRevealedIndices(initialRevealedIndices(questions[current].word));
    }
    setShowHint(!showHint);
  };

  const revealMore = () => {
    const word = questions[current].word;
    const chars = word.split('');
    // Find all unrevealed indices (excluding spaces and hyphens which are always visible)
    const unrevealed: number[] = [];
    for (let i = 0; i < chars.length; i++) {
      if (!revealedIndices.has(i) && chars[i] !== ' ' && chars[i] !== '-') {
        unrevealed.push(i);
      }
    }
    if (unrevealed.length === 0) return;
    const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    const next = new Set(revealedIndices);
    next.add(randomIndex);
    setRevealedIndices(next);
    setHintPenaltyApplied(true);
  };

  const nextQuestion = () => {
    if (current + 1 >= questions.length) {
      setPhase('done');
    } else {
      setCurrent((c) => c + 1);
      setInput('');
      setResult(null);
      setShowHint(false);
      setRevealedIndices(new Set());
      setHintPenaltyApplied(false);
    }
  };

  if (phase === 'setup') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
          <div
            className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
              theme === 'cinema'
                ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                : 'bg-sky-100 text-sky-500'
            }`}
          >
            <Keyboard className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{t('typingTitle')}</h2>
          <p className="text-slate-500 mt-1">{t('typingDesc')}</p>
          <div className="mt-8">
            <p className="text-sm font-semibold text-slate-600 mb-3">{t('questionCount')}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`w-16 h-16 rounded-2xl font-bold text-lg transition-all cursor-pointer ${
                    count === n
                      ? theme === 'cinema'
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 shadow-md shadow-amber-500/20'
                        : 'bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-md shadow-sky-500/20'
                      : theme === 'cinema'
                      ? 'bg-stone-900 border border-amber-500/25 text-stone-300 hover:border-amber-500/50 hover:text-amber-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={start}
            disabled={vocabs.length < 1}
            className="mt-8 px-8 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold hover:from-sky-600 hover:to-teal-600 transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {t('startQuiz')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center mb-4 shadow-md">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{t('typingComplete')}</h2>
          <div className="mt-6 flex items-center justify-center gap-8">
            <div>
              <p
                className={`text-4xl font-bold ${
                  theme === 'cinema' ? 'text-amber-400' : 'text-sky-600'
                }`}
              >
                {Math.round(score)}
              </p>
              <p className="text-sm text-slate-500">{t('correct')}</p>
            </div>
            <div className="w-px h-12 bg-slate-200" />
            <div>
              <p className="text-4xl font-bold text-slate-400">{questions.length - Math.round(score)}</p>
              <p className="text-sm text-slate-500">{t('incorrect')}</p>
            </div>
            <div className="w-px h-12 bg-slate-200" />
            <div>
              <p className="text-4xl font-bold text-teal-600">{percentage}%</p>
              <p className="text-sm text-slate-500">{t('score')}</p>
            </div>
          </div>
          <button
            onClick={() => setPhase('setup')}
            className="mt-8 flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold hover:from-sky-600 hover:to-teal-600 transition-all shadow-md mx-auto cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            {t('retryQuiz')}
          </button>
        </div>
      </div>
    );
  }

  // Playing
  const q = questions[current];
  const progress = ((current + 1) / questions.length) * 100;
  const wordChars = q.word.split('');

  // Check if all non-space/hyphen characters are revealed
  const hasUnrevealed = wordChars.some(
    (ch, i) => !revealedIndices.has(i) && ch !== ' ' && ch !== '-'
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-600">
            {t('question')} {current + 1} {t('of')} {questions.length}
          </span>
          <span
            className={`text-sm font-semibold ${
              theme === 'cinema' ? 'text-amber-400' : 'text-sky-600'
            }`}
          >
            {t('score')}: {Math.round(score)}
          </span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
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

      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t('meaningLabel')}</p>
          <h2 className="text-3xl font-bold text-slate-800">{q.meaning}</h2>
          <div className="flex items-center justify-center gap-3 mt-3">
            {q.type && (
              <span
                className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  theme === 'cinema'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-sky-50 border-sky-100 text-sky-600'
                }`}
              >
                {q.type}
              </span>
            )}
            <button
              onClick={() => speak(q.word, rate)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                theme === 'cinema'
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  : 'bg-sky-50 hover:bg-sky-100 text-sky-600'
              }`}
              title={t('playAudio')}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <select
              value={rate}
              onChange={(e) => {
                const newRate = parseFloat(e.target.value);
                setRate(newRate);
                setGlobalRate(newRate);
              }}
              className="text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
            >
              {speedOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.key as TranslationKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hint */}
        <div className="flex flex-col items-center gap-2 mb-5">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleHint}
              className={`flex items-center gap-1.5 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                showHint
                  ? theme === 'cinema'
                    ? 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                    : 'bg-amber-100 border-amber-300 text-amber-800'
                  : theme === 'cinema'
                  ? 'bg-stone-900/80 border-amber-500/20 text-stone-300 hover:text-amber-200 hover:border-amber-500/40'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>{t('hint')}</span>
            </button>
            {showHint && hasUnrevealed && result === null && (
              <button
                onClick={revealMore}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                  theme === 'cinema'
                    ? 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
              >
                <span>{t('showMoreHints')}</span>
                <span className="text-rose-400 font-bold">{t('hintPenalty')}</span>
              </button>
            )}
          </div>
          {showHint && (
            <div
              className={`mt-2 p-3.5 rounded-xl border text-center animate-fade-in ${
                theme === 'cinema'
                  ? 'bg-amber-950/30 border-amber-500/25'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <p className="text-xs text-slate-400 mb-2">
                {q.word.length} {t('letters')}
              </p>
              <div className="flex flex-row gap-2 justify-center font-mono text-xl tracking-widest">
                {wordChars.map((ch, i) => {
                  const isRevealed = revealedIndices.has(i) || ch === ' ' || ch === '-';
                  return (
                    <span
                      key={i}
                      className={`inline-block w-7 py-1 text-center rounded-lg border font-bold ${
                        isRevealed
                          ? theme === 'cinema'
                            ? 'text-amber-300 bg-amber-500/20 border-amber-500/40'
                            : 'text-slate-800 bg-white border-slate-300 shadow-2xs'
                          : theme === 'cinema'
                          ? 'text-stone-600 bg-stone-900 border-stone-800'
                          : 'text-slate-300 bg-slate-100 border-slate-200'
                      }`}
                    >
                      {isRevealed ? ch : '_'}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (result !== null) nextQuestion();
              else handleCheck();
            }
          }}
          disabled={result !== null}
          className={`w-full text-center text-2xl font-bold px-4 py-4 rounded-xl border-2 transition-all focus:outline-none ${
            result === 'correct'
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
              : result === 'incorrect'
              ? 'border-rose-400 bg-rose-50 text-rose-700'
              : theme === 'cinema'
              ? 'border-amber-500/40 bg-[#15100c] text-[#fffbeb] placeholder-stone-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30'
              : 'border-slate-200 bg-slate-50 text-slate-800 focus:ring-2 focus:ring-sky-400 focus:border-transparent'
          }`}
          placeholder={t('typeHere')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />

        {result === 'incorrect' && (
          <div
            className={`mt-3 p-3 rounded-xl border flex items-center justify-center gap-2 animate-fade-in ${
              theme === 'cinema'
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <span className="text-xs uppercase font-bold tracking-wider opacity-75">
              {lang === 'vi' ? 'Đáp án đúng:' : 'Correct word:'}
            </span>
            <p className="text-base font-bold">{q.word}</p>
            <button
              onClick={() => speak(q.word, rate)}
              className="p-1 rounded-full hover:bg-rose-500/20 transition-colors cursor-pointer"
              title={t('playAudio')}
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {result === null ? (
          <button
            onClick={handleCheck}
            disabled={!input.trim()}
            className="mt-5 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold hover:from-sky-600 hover:to-teal-600 transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5" />
            {t('checkAnswer')}
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            autoFocus
            className="mt-5 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold hover:from-sky-600 hover:to-teal-600 transition-all shadow-md animate-fade-in cursor-pointer"
          >
            <span>{current + 1 >= questions.length ? t('finishQuiz') : t('nextQuestion')}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {result !== null && (
          <div className="mt-3 flex items-center justify-center gap-2">
            {result === 'correct' ? (
              <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-500">
                <CheckCircle2 className="w-5 h-5" /> {t('correct')}! 🎉
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-bold text-rose-500">
                <XCircle className="w-5 h-5" /> {t('incorrect')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
