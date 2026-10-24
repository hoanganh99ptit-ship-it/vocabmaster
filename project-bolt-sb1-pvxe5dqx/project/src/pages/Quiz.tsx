import { useState, useMemo, useEffect } from 'react';
import { CheckCircle2, XCircle, ChevronRight, RotateCcw, Volume2, VolumeX, Trophy, ListChecks } from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
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
import { useTheme } from '@/context/ThemeContext';
import type { Vocabulary, QuizQuestion } from '@/lib/types';
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

function buildQuestions(vocabs: Vocabulary[], count: number): QuizQuestion[] {
  const selected = shuffle(vocabs).slice(0, count);
  return selected.map((vocab) => {
    const others = vocabs.filter((v) => v.id !== vocab.id);
    const distractors = shuffle(others).slice(0, 3).map((v) => v.word);
    const options = shuffle([vocab.word, ...distractors]);
    const correctIndex = options.indexOf(vocab.word);
    return { vocab, options, correctIndex };
  });
}

export function Quiz() {
  const { vocabs, incrementError, updateSRS } = useVocab();
  const { t } = useLanguage();
  const { show } = useToast();
  const { theme } = useTheme();

  const [phase, setPhase] = useState<'setup' | 'playing' | 'done'>('setup');
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [score, setScore] = useState(0);
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

  const startQuiz = () => {
    if (vocabs.length < 4) {
      show(t('notEnoughWords'), 'error');
      return;
    }
    const qs = buildQuestions(vocabs, Math.min(count, vocabs.length));
    setQuestions(qs);
    setCurrent(0);
    setSelectedAnswer(null);
    setScore(0);
    setPhase('playing');
  };

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    const correct = index === questions[current].correctIndex;
    if (correct) {
      playCorrectSound();
      setScore((s) => s + 1);
      speak(questions[current].vocab.word, rate);
    } else {
      playIncorrectSound();
      incrementError(questions[current].vocab.word);
    }
    // Update Spaced Repetition (SRS)
    updateSRS(questions[current].vocab.id, correct ? 4 : 1);

    addPracticeRecord({
      type: 'quiz',
      vocabId: questions[current].vocab.id,
      word: questions[current].vocab.word,
      correct,
      timestamp: Date.now(),
    });
  };

  const nextQuestion = () => {
    if (current + 1 >= questions.length) {
      playCelebrationSound();
      setPhase('done');
    } else {
      setCurrent((c) => c + 1);
      setSelectedAnswer(null);
    }
  };

  const retry = () => {
    setPhase('setup');
  };

  if (phase === 'setup') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className={`rounded-2xl border p-8 shadow-sm text-center ${
          theme === 'cinema'
            ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
            : 'bg-white border-slate-200'
        }`}>
          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
            theme === 'cinema' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-sky-100 text-sky-500'
          }`}>
            <ListChecks className="w-8 h-8" />
          </div>
          <h2 className={`text-2xl font-bold ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'}`}>
            {t('quizTitle')}
          </h2>
          <p className={`mt-1 ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>{t('quizDesc')}</p>
          <div className="mt-8">
            <p className={`text-sm font-semibold mb-3 ${theme === 'cinema' ? 'text-amber-200/90' : 'text-slate-600'}`}>
              {t('questionCount')}
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`w-16 h-16 rounded-2xl font-bold text-lg transition-all ${
                    count === n
                      ? (theme === 'cinema'
                          ? 'bg-amber-500 text-stone-950 font-black shadow-lg shadow-amber-500/30'
                          : 'bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-md shadow-sky-500/20')
                      : (theme === 'cinema'
                          ? 'bg-stone-900 border border-amber-500/30 text-amber-200 hover:bg-stone-800'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={startQuiz}
            disabled={vocabs.length < 4}
            className={`mt-8 px-8 py-3 rounded-xl font-semibold transition-all shadow-md disabled:opacity-50 ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-black hover:from-amber-500 hover:to-amber-400 shadow-amber-950/40'
                : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600'
            }`}
          >
            {t('startQuiz')}
          </button>
          {vocabs.length < 4 && (
            <p className="mt-3 text-sm text-rose-500">{t('notEnoughWords')}</p>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-2xl mx-auto">
        <div className={`rounded-2xl border p-8 shadow-sm text-center ${
          theme === 'cinema'
            ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
            : 'bg-white border-slate-200'
        }`}>
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 shadow-md ${
            theme === 'cinema' ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-stone-950' : 'bg-gradient-to-br from-amber-400 to-orange-400 text-white'
          }`}>
            <Trophy className="w-10 h-10" />
          </div>
          <h2 className={`text-2xl font-bold ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'}`}>
            {t('quizComplete')}
          </h2>
          <div className="mt-6 flex items-center justify-center gap-8">
            <div>
              <p className={`text-4xl font-bold ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-600'}`}>{score}</p>
              <p className={`text-sm ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>{t('correct')}</p>
            </div>
            <div className={`w-px h-12 ${theme === 'cinema' ? 'bg-amber-500/30' : 'bg-slate-200'}`} />
            <div>
              <p className={`text-4xl font-bold ${theme === 'cinema' ? 'text-stone-500' : 'text-slate-400'}`}>{questions.length - score}</p>
              <p className={`text-sm ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>{t('incorrect')}</p>
            </div>
            <div className={`w-px h-12 ${theme === 'cinema' ? 'bg-amber-500/30' : 'bg-slate-200'}`} />
            <div>
              <p className={`text-4xl font-bold ${theme === 'cinema' ? 'text-emerald-400' : 'text-teal-600'}`}>{percentage}%</p>
              <p className={`text-sm ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>{t('score')}</p>
            </div>
          </div>
          <div className="mt-8 flex gap-3 justify-center">
            <button
              onClick={retry}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-colors ${
                theme === 'cinema'
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <RotateCcw className="w-5 h-5" />
              {t('retryQuiz')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Playing
  const q = questions[current];
  const progress = ((current + 1) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-semibold ${theme === 'cinema' ? 'text-stone-300' : 'text-slate-600'}`}>
            {t('question')} {current + 1} {t('of')} {questions.length}
          </span>
          <span className={`text-sm font-semibold ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-600'}`}>
            {t('score')}: {score}
          </span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${theme === 'cinema' ? 'bg-stone-900 border border-amber-500/30' : 'bg-slate-200'}`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300'
                : 'bg-gradient-to-r from-sky-500 to-teal-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className={`rounded-2xl border p-8 shadow-sm ${
        theme === 'cinema'
          ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
          : 'bg-white border-slate-200'
      }`}>
        <div className="text-center mb-6">
          <p className={`text-sm mb-2 ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-400'}`}>{t('meaningLabel')}</p>
          <h2 className={`text-3xl font-bold ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'}`}>
            {q.vocab.meaning}
          </h2>
          {q.vocab.type && (
            <span className={`inline-block mt-2 text-sm font-semibold px-3 py-1 rounded-full border ${
              theme === 'cinema'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-sky-50 text-sky-600 border-sky-100'
            }`}>
              {q.vocab.type}
            </span>
          )}
        </div>

        {/* Audio + speed + SFX toggle */}
        <div className="flex items-center justify-center gap-2.5 mb-6 flex-wrap">
          <button
            onClick={() => speak(q.vocab.word, rate)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              theme === 'cinema'
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                : 'bg-sky-500 hover:bg-sky-600 text-white'
            }`}
            title={t('playAudio')}
          >
            <Volume2 className="w-5 h-5" />
          </button>
          <select
            value={rate}
            onChange={(e) => {
              const newRate = parseFloat(e.target.value);
              setRate(newRate);
              setGlobalRate(newRate);
            }}
            className={`text-sm font-medium rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 cursor-pointer ${
              theme === 'cinema'
                ? 'bg-stone-900 border-amber-500/40 text-amber-200 focus:ring-amber-400'
                : 'bg-slate-100 border-slate-200 text-slate-600 focus:ring-sky-400'
            }`}
          >
            {speedOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.key as TranslationKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const next = toggleSound();
              setSfxOn(next);
            }}
            className={`h-9 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
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
            {sfxOn ? <Volume2 className="w-4 h-4 text-emerald-500" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span>{sfxOn ? 'SFX Bật' : 'SFX Tắt'}</span>
          </button>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {q.options.map((option, i) => {
            const isCorrect = i === q.correctIndex;
            const isSelected = i === selectedAnswer;
            let style = theme === 'cinema'
              ? 'border-amber-500/30 bg-stone-900/80 hover:border-amber-400 hover:bg-stone-800 text-amber-100'
              : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50 text-slate-700';

            if (selectedAnswer !== null) {
              if (isCorrect) {
                style = theme === 'cinema'
                  ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
                  : 'border-emerald-400 bg-emerald-50 text-emerald-700';
              } else if (isSelected) {
                style = theme === 'cinema'
                  ? 'border-rose-500 bg-rose-950/60 text-rose-200'
                  : 'border-rose-400 bg-rose-50 text-rose-700';
              } else {
                style = theme === 'cinema'
                  ? 'border-amber-500/20 bg-stone-900/40 text-stone-600'
                  : 'border-slate-200 bg-white text-slate-400';
              }
            }
            return (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-4 rounded-xl border-2 font-semibold transition-all ${style}`}
              >
                <button
                  onClick={() => handleAnswer(i)}
                  disabled={selectedAnswer !== null}
                  className="flex-1 text-left cursor-pointer"
                >
                  {option}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      speak(option, rate);
                    }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                      theme === 'cinema'
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                        : 'bg-sky-50 hover:bg-sky-100 text-sky-500'
                    }`}
                    title={t('playAudio')}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                  {selectedAnswer !== null && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {selectedAnswer !== null && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-500" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Next button */}
        {selectedAnswer !== null && (
          <button
            onClick={nextQuestion}
            className={`mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-sm animate-fade-in ${
              theme === 'cinema'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-black hover:from-amber-500 hover:to-amber-400'
                : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600'
            }`}
          >
            {current + 1 >= questions.length ? t('finishQuiz') : t('nextQuestion')}
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
