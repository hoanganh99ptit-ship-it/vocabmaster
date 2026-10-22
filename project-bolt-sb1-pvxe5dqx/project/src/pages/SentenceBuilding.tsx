import { useState } from 'react';
import {
  PenLine,
  ChevronRight,
  RotateCcw,
  Trophy,
  Sparkles,
  CheckCircle2,
  XCircle,
  Lightbulb,
  BookOpen,
  Volume2,
  Loader2,
  Check,
  Copy,
  Flame,
  Award,
} from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import { useToast } from '@/components/Toast';
import { evaluateSentence, type GrammarEvaluation } from '@/lib/grammarCheck';
import { evaluateWithGemini } from '@/services/geminiService';
import { speak, speedOptions, getGlobalRate, setGlobalRate } from '@/lib/speech';
import { addPracticeRecord } from '@/lib/storage';
import type { Vocabulary } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';

const WORD_COUNTS = [5, 10, 15, 20];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function SentenceBuilding() {
  const { vocabs, updateSRS } = useVocab();
  const { t, lang } = useLanguage();
  const { theme } = useTheme();
  const { show } = useToast();

  const [phase, setPhase] = useState<'setup' | 'playing' | 'done'>('setup');
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<Vocabulary[]>([]);
  const [current, setCurrent] = useState(0);
  const [sentence, setSentence] = useState('');
  const [evaluation, setEvaluation] = useState<GrammarEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [totalAccuracy, setTotalAccuracy] = useState(0);
  const [rate, setRate] = useState(getGlobalRate());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const start = () => {
    if (vocabs.length < 1) {
      show(t('notEnoughWordsSentence'), 'error');
      return;
    }
    const qs = shuffle(vocabs).slice(0, Math.min(count, vocabs.length));
    setQuestions(qs);
    setCurrent(0);
    setSentence('');
    setEvaluation(null);
    setTotalAccuracy(0);
    setPhase('playing');
  };

  const handleEvaluate = async () => {
    if (!sentence.trim() || evaluating) return;
    setEvaluating(true);

    const targetWord = questions[current].word;
    const meaning = questions[current].meaning;
    const wordType = questions[current].type || '';
    const userSentence = sentence.trim();

    try {
      // 1. First attempt: deep evaluation with Gemini
      const aiResult = await evaluateWithGemini({
        sentence: userSentence,
        targetWord,
        wordType,
        meaning,
        lang,
      });

      // If AI succeeded, use it; otherwise fallback to local rule-based evaluation
      const result =
        aiResult ||
        evaluateSentence({
          sentence: userSentence,
          targetWord,
          wordType,
          meaning,
          lang,
        });

      setEvaluation(result);
      setTotalAccuracy((prev) => prev + result.accuracy);

      // SRS scoring based on accuracy: 5 (>=90%), 4 (>=70%), 3 (>=50%), 2 (>=30%), 1 (<30%)
      const srsScore =
        result.accuracy >= 90
          ? 5
          : result.accuracy >= 70
          ? 4
          : result.accuracy >= 50
          ? 3
          : result.accuracy >= 30
          ? 2
          : 1;
      updateSRS(questions[current].id, srsScore);

      addPracticeRecord({
        type: 'sentence',
        vocabId: questions[current].id,
        word: questions[current].word,
        correct: result.accuracy >= 70,
        timestamp: Date.now(),
      });
    } catch {
      // Offline / fallback to local rule-based grammar checker
      const fallback = evaluateSentence({
        sentence: userSentence,
        targetWord,
        wordType,
        meaning,
        lang,
      });
      setEvaluation(fallback);
      setTotalAccuracy((prev) => prev + fallback.accuracy);

      const srsScore = fallback.accuracy >= 70 ? 4 : 2;
      updateSRS(questions[current].id, srsScore);

      addPracticeRecord({
        type: 'sentence',
        vocabId: questions[current].id,
        word: questions[current].word,
        correct: fallback.accuracy >= 70,
        timestamp: Date.now(),
      });
    } finally {
      setEvaluating(false);
    }
  };

  const nextWord = () => {
    if (current + 1 >= questions.length) {
      setPhase('done');
    } else {
      setCurrent((c) => c + 1);
      setSentence('');
      setEvaluation(null);
      setCopiedIndex(null);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    show(lang === 'vi' ? 'Đã sao chép câu vào clipboard' : 'Copied sentence to clipboard', 'success');
    setTimeout(() => setCopiedIndex(null), 2000);
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
            <PenLine className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{t('sentenceTitle')}</h2>
          <p className="text-slate-500 mt-1">{t('sentenceDesc')}</p>
          <div className="mt-8">
            <p className="text-sm font-semibold text-slate-600 mb-3">{t('wordCount')}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {WORD_COUNTS.map((n) => (
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
            {t('startSentence')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    const avgAccuracy = Math.round(totalAccuracy / questions.length);
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center mb-4 shadow-md">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{t('sentenceComplete')}</h2>
          <div className="mt-6">
            <p
              className={`text-5xl font-bold ${
                theme === 'cinema' ? 'text-amber-400' : 'text-sky-600'
              }`}
            >
              {avgAccuracy}%
            </p>
            <p className="text-sm text-slate-500 mt-1">{t('avgAccuracy')}</p>
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

  // Playing phase
  const q = questions[current];
  const progress = ((current + 1) / questions.length) * 100;
  const alternatives = evaluation?.betterAlternatives || evaluation?.nativeAlternatives || [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-600">
            {t('question')} {current + 1} {t('of')} {questions.length}
          </span>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              theme === 'cinema'
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                : 'bg-sky-50 text-sky-700 border-sky-200'
            }`}
          >
            SRS Spaced Repetition Active
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
        {/* Target word with audio (High-contrast, theme-synchronized box) */}
        <div
          className={`text-center mb-6 p-6 sm:p-7 rounded-2xl border transition-all ${
            theme === 'cinema'
              ? 'bg-[#15100c] border-amber-600/35 shadow-inner'
              : theme === 'retro'
              ? 'bg-[#fbf6ee] border-[#ebdccb]'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
            {t('targetWord')}
          </p>
          <div className="flex items-center justify-center gap-3">
            <h2
              className={`text-3xl sm:text-4xl font-bold ${
                theme === 'cinema' ? 'text-amber-300' : 'text-slate-800'
              }`}
            >
              {q.word}
            </h2>
            <button
              onClick={() => speak(q.word, rate)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                theme === 'cinema'
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                  : 'bg-sky-100 hover:bg-sky-200 text-sky-600'
              }`}
              title={t('playAudio')}
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>
          {q.type && (
            <span
              className={`inline-block mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                theme === 'cinema'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-sky-50 border-sky-100 text-sky-600'
              }`}
            >
              {q.type}
            </span>
          )}
          <p
            className={`mt-2 text-lg font-bold ${
              theme === 'cinema' ? 'text-emerald-300' : 'text-slate-700'
            }`}
          >
            {q.meaning}
          </p>

          {/* Speed control */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
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

        {/* Textarea */}
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          disabled={evaluation !== null || evaluating}
          rows={4}
          className={`w-full px-4 py-3.5 rounded-xl border transition-all resize-y ${
            theme === 'cinema'
              ? 'bg-[#15100c] border-amber-600/40 text-[#fffbeb] placeholder-stone-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30'
              : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent'
          }`}
          placeholder={t('writeSentence')}
        />

        {/* Evaluate button */}
        {evaluation === null && !evaluating ? (
          <button
            onClick={handleEvaluate}
            disabled={!sentence.trim()}
            className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold hover:from-sky-600 hover:to-teal-600 transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-5 h-5" />
            {t('evaluate')}
          </button>
        ) : evaluating ? (
          <div
            className={`mt-4 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border font-semibold ${
              theme === 'cinema'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                : 'bg-sky-50 border-sky-200 text-sky-700'
            }`}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('aiEvaluating')}
          </div>
        ) : evaluation ? (
          <>
            {/* Structured evaluation results with detailed breakdown */}
            <div className="mt-6 space-y-5 animate-fade-in">
              {/* Scores breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Grammar Score Card */}
                <div
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    theme === 'cinema'
                      ? 'bg-stone-900/80 border-emerald-500/30 text-stone-200'
                      : 'border-emerald-200 bg-emerald-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                        {lang === 'vi' ? 'Điểm Ngữ Pháp (Grammar)' : 'Grammar Score'}
                      </span>
                    </div>
                    <span className="text-lg font-black text-emerald-500">
                      {evaluation.grammarScore ?? evaluation.accuracy}/100
                    </span>
                  </div>
                  <div className="h-2 bg-emerald-200/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${evaluation.grammarScore ?? evaluation.accuracy}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-emerald-600 mt-2 font-medium">
                    {(evaluation.grammarScore ?? evaluation.accuracy) >= 80
                      ? lang === 'vi'
                        ? 'Cấu trúc & ngữ pháp rất chuẩn xác'
                        : 'Accurate structure & syntax'
                      : lang === 'vi'
                      ? 'Cần cải thiện ngữ pháp hoặc giới từ'
                      : 'Needs grammar/preposition revision'}
                  </p>
                </div>

                {/* 2. Naturalness Score Card */}
                <div
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    theme === 'cinema'
                      ? 'bg-stone-900/80 border-amber-500/30 text-stone-200'
                      : 'border-sky-200 bg-sky-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                        {lang === 'vi' ? 'Độ Tự Nhiên (Naturalness)' : 'Naturalness Score'}
                      </span>
                    </div>
                    <span className="text-lg font-black text-amber-500">
                      {evaluation.naturalnessScore ?? 75}/100
                    </span>
                  </div>
                  <div className="h-2 bg-amber-200/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${evaluation.naturalnessScore ?? 75}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-amber-600 mt-2 font-medium">
                    {(evaluation.naturalnessScore ?? 75) >= 85
                      ? lang === 'vi'
                        ? 'Diễn đạt tự nhiên như người bản xứ'
                        : 'Natural, native-like phrasing'
                      : lang === 'vi'
                      ? 'Có thể dùng cách diễn đạt trôi chảy hơn'
                      : 'Could be phrased more idiomatically'}
                  </p>
                </div>
              </div>

              {/* Indicator Badges */}
              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                    evaluation.isSpellingCorrect
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                  }`}
                >
                  {evaluation.isSpellingCorrect ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  {t('spellingBadge')}:{' '}
                  {evaluation.isSpellingCorrect ? t('spellingCorrect') : t('spellingIncorrect')}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                    evaluation.isGrammarCorrect
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                  }`}
                >
                  {evaluation.isGrammarCorrect ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  {evaluation.isGrammarCorrect ? t('grammarCorrect') : t('grammarIncorrect')}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                    evaluation.isNatural
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                      : 'bg-stone-500/10 text-stone-400 border-stone-500/30'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('naturalnessBadge')}: {evaluation.isNatural ? t('natural') : t('unnatural')}
                </span>
              </div>

              {/* Detected Errors List */}
              {evaluation.detectedErrors.length > 0 ? (
                <div
                  className={`rounded-xl p-4 border ${
                    theme === 'cinema'
                      ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                      : 'border-rose-200 bg-rose-50'
                  }`}
                >
                  <div className="flex items-start gap-2 mb-3">
                    <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-rose-500">{t('detectedErrorsTitle')}</p>
                  </div>
                  <div className="space-y-3 ml-7">
                    {evaluation.detectedErrors.map((err, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg p-3 border shadow-sm ${
                          theme === 'cinema'
                            ? 'bg-[#1a1410] border-rose-500/30 text-stone-200'
                            : 'bg-white border-rose-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            {err.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-rose-400 font-medium line-through">
                            {err.incorrectPart}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="text-emerald-400 font-semibold">{err.correction}</span>
                        </div>
                        {err.explanationVi && (
                          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                            {err.explanationVi}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className={`rounded-xl p-4 border ${
                    theme === 'cinema'
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'border-emerald-200 bg-emerald-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <p className="text-sm font-bold text-emerald-500">{t('noErrorsFound')}</p>
                  </div>
                </div>
              )}

              {/* Better Alternatives */}
              {alternatives.length > 0 && (
                <div
                  className={`rounded-2xl p-5 border ${
                    theme === 'cinema'
                      ? 'bg-[#15100c] border-amber-500/30 text-stone-200 shadow-sm'
                      : 'border-sky-200 bg-gradient-to-br from-sky-50/70 to-teal-50/70 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-2.5 mb-3">
                    <div
                      className={`p-1.5 rounded-lg text-stone-950 font-bold shadow-sm ${
                        theme === 'cinema' ? 'bg-amber-500' : 'bg-sky-500 text-white'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4
                        className={`text-sm font-bold ${
                          theme === 'cinema' ? 'text-amber-300' : 'text-slate-900'
                        }`}
                      >
                        {lang === 'vi'
                          ? 'Cách Diễn Đạt Tự Nhiên Hơn (Better Alternatives)'
                          : 'Better Alternatives'}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {lang === 'vi'
                          ? 'Gợi ý các câu văn chuẩn bản xứ với cấu trúc và collocation nâng cao'
                          : 'Native-speaker alternatives with advanced idioms and collocations'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 mt-3">
                    {alternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl p-4 border transition-all ${
                          theme === 'cinema'
                            ? 'bg-[#1a1410] border-amber-500/25 hover:border-amber-500/50'
                            : 'bg-white border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                                theme === 'cinema'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <div className="flex-1">
                              <p
                                className={`text-sm font-semibold leading-snug ${
                                  theme === 'cinema' ? 'text-[#fffbeb]' : 'text-slate-900'
                                }`}
                              >
                                {alt.sentence}
                              </p>
                              {alt.translation && (
                                <p className="text-xs text-slate-400 mt-1 italic leading-relaxed">
                                  {alt.translation}
                                </p>
                              )}
                              {alt.explanation && (
                                <div
                                  className={`mt-2 text-xs rounded-lg p-2 border leading-relaxed ${
                                    theme === 'cinema'
                                      ? 'bg-amber-950/30 border-amber-500/25 text-amber-200'
                                      : 'bg-sky-50 text-sky-800 border-sky-100'
                                  }`}
                                >
                                  <span className="font-semibold text-amber-500">
                                    {lang === 'vi' ? '💡 Điểm nổi bật: ' : '💡 Key highlight: '}
                                  </span>
                                  {alt.explanation}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => speak(alt.sentence, rate)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                theme === 'cinema'
                                  ? 'bg-stone-800 text-stone-300 hover:text-amber-300 hover:bg-amber-500/20'
                                  : 'bg-slate-100 text-slate-600 hover:text-sky-600 hover:bg-sky-50'
                              }`}
                              title={t('playAudio')}
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => copyToClipboard(alt.sentence, idx)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                theme === 'cinema'
                                  ? 'bg-stone-800 text-stone-300 hover:text-amber-300 hover:bg-amber-500/20'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                              title="Copy sentence"
                            >
                              {copiedIndex === idx ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed AI Analysis */}
              {evaluation.detailedAnalysisVi && (
                <div
                  className={`rounded-xl p-4 border ${
                    theme === 'cinema'
                      ? 'bg-amber-950/30 border-amber-500/30 text-stone-200'
                      : 'border-amber-200 bg-amber-50/80 text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-amber-500">{t('detailedAnalysis')}</p>
                  </div>
                  <div className="text-xs whitespace-pre-line ml-7 leading-relaxed space-y-1">
                    {evaluation.detailedAnalysisVi.split('\n').map((line, i) => {
                      const trimmed = line.trim();
                      if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
                        return (
                          <p key={i} className="ml-3 my-0.5">
                            {trimmed}
                          </p>
                        );
                      }
                      if (
                        trimmed.match(
                          /^(Điểm tốt|Điểm cần|Phối hợp|Sắc thái|Ngữ pháp|Collocation|Tone|Grammar)/i
                        )
                      ) {
                        return (
                          <p key={i} className="font-bold text-amber-400 mt-2.5 mb-0.5">
                            {trimmed}
                          </p>
                        );
                      }
                      return (
                        <p key={i} className="my-0.5">
                          {trimmed}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grammar Rules Breakdown */}
              {evaluation.grammarRulesBreakdown && (
                <div
                  className={`rounded-xl p-4 border ${
                    theme === 'cinema'
                      ? 'bg-[#15100c] border-amber-500/25 text-stone-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-2 mb-1">
                    <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-500">
                      {t('grammarStructure')}
                    </p>
                  </div>
                  <p className="text-xs ml-6 whitespace-pre-line leading-relaxed">
                    {evaluation.grammarRulesBreakdown}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={nextWord}
              autoFocus
              className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold hover:from-sky-600 hover:to-teal-600 transition-all shadow-md cursor-pointer animate-fade-in"
            >
              <span>{current + 1 >= questions.length ? t('finishQuiz') : t('nextWord')}</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
