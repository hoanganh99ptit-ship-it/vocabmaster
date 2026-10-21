import { useMemo, useState } from 'react';
import {
  TrendingDown,
  Target,
  Award,
  BookOpen,
  ChevronRight,
  BarChart3,
  AlertTriangle,
  Volume2,
  Flame,
  Trophy,
  Calendar,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { speak } from '@/lib/speech';
import {
  getPracticeHistory,
  getWeeklyGoal,
  setWeeklyTarget,
  getStreakData,
  getDaysLeftInWeek,
  type PracticeRecord,
  type WeeklyGoal,
  type StreakData,
} from '@/lib/storage';
import type { TabKey } from '@/lib/types';

interface AnalyticsProps {
  onNavigate: (tab: TabKey) => void;
  weakWordIds?: Set<string>;
}

export function Analytics({ onNavigate }: AnalyticsProps) {
  const { vocabs } = useVocab();
  const { t, lang } = useLanguage();

  const [weeklyGoal, setWeeklyGoalState] = useState<WeeklyGoal>(() => getWeeklyGoal());
  const [streakData, setStreakDataState] = useState<StreakData>(() => getStreakData());
  const daysLeft = useMemo(() => getDaysLeftInWeek(), []);

  const handleSelectTarget = (target: number) => {
    const updated = setWeeklyTarget(target);
    setWeeklyGoalState({ ...updated });
  };

  const weekDays = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay() || 7; // 1 = Mon, 7 = Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - (currentDay - 1));

    const days = [];
    const labelsVi = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const labelsEn = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isToday = dateStr === now.toISOString().split('T')[0];
      const isPast = d <= now;
      const isActive = streakData.activeDatesThisWeek.includes(dateStr);

      days.push({
        label: lang === 'vi' ? labelsVi[i] : labelsEn[i],
        dateStr,
        dayNum: d.getDate(),
        isToday,
        isPast,
        isActive,
      });
    }
    return days;
  }, [streakData, lang]);

  const history = useMemo(() => getPracticeHistory(), []);

  const weakWords = useMemo(() => {
    return [...vocabs]
      .filter((v) => v.error_count > 0)
      .sort((a, b) => b.error_count - a.error_count)
      .slice(0, 10);
  }, [vocabs]);

  const stats = useMemo(() => {
    const quizRecords = history.filter((r) => r.type === 'quiz');
    const typingRecords = history.filter((r) => r.type === 'typing');
    const sentenceRecords = history.filter((r) => r.type === 'sentence');
    const clozeRecords = history.filter((r) => r.type === 'cloze');

    const calcAccuracy = (records: PracticeRecord[]) => {
      if (records.length === 0) return 0;
      const correct = records.filter((r) => r.correct).length;
      return Math.round((correct / records.length) * 100);
    };

    const sentenceAvg = sentenceRecords.length > 0
      ? Math.round(sentenceRecords.reduce((sum, r) => sum + (r.accuracy || 0), 0) / sentenceRecords.length)
      : 0;

    return {
      quizAccuracy: calcAccuracy(quizRecords),
      typingAccuracy: calcAccuracy(typingRecords),
      sentenceAccuracy: sentenceAvg,
      clozeAccuracy: calcAccuracy(clozeRecords),
      quizTotal: quizRecords.length,
      typingTotal: typingRecords.length,
      sentenceTotal: sentenceRecords.length,
      clozeTotal: clozeRecords.length,
      quizCorrect: quizRecords.filter((r) => r.correct).length,
      typingCorrect: typingRecords.filter((r) => r.correct).length,
      clozeCorrect: clozeRecords.filter((r) => r.correct).length,
    };
  }, [history]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    vocabs.forEach((v) => {
      const cat = v.category || 'General';
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [vocabs]);

  const maxCatCount = Math.max(...categories.map((c) => c[1]), 1);

  const hasData = history.length > 0;

  if (vocabs.length === 0 && !hasData) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <BarChart3 className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700">{t('noDataYet')}</h3>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Weekly Goal & Motivation Card */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-sky-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-indigo-700/40 animate-fade-in">
        {/* Background glow decoration */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Header Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/25 flex-shrink-0">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {lang === 'vi' ? 'Mục tiêu ôn tập tuần này' : 'Weekly Review Goal'}
                  </h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-sky-200 border border-white/10">
                    {lang === 'vi' ? `Tuần ${weeklyGoal.weekKey}` : `Week ${weeklyGoal.weekKey}`}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    {lang === 'vi'
                      ? `Còn ${daysLeft} ngày nữa để hoàn thành mục tiêu!`
                      : `${daysLeft} days left to achieve this goal!`}
                  </span>
                </p>
              </div>
            </div>

            {/* Target Select Buttons */}
            <div className="flex items-center gap-1.5 bg-white/10 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md self-start md:self-center">
              <span className="text-xs font-semibold text-slate-300 px-2">
                {lang === 'vi' ? 'Chỉ tiêu:' : 'Target:'}
              </span>
              {[30, 50, 75, 100].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleSelectTarget(num)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    weeklyGoal.targetWords === num
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {num} {lang === 'vi' ? 'từ' : 'w'}
                </button>
              ))}
            </div>
          </div>

          {/* Progress Bar & Big Numbers */}
          <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-sm mb-6">
            <div className="flex items-end justify-between gap-4 mb-3">
              <div>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider block mb-1">
                  {lang === 'vi' ? 'Tiến độ hoàn thành' : 'Progress'}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-white">
                    {weeklyGoal.reviewedCount}
                  </span>
                  <span className="text-lg text-slate-400 font-semibold">
                    / {weeklyGoal.targetWords} {lang === 'vi' ? 'từ' : 'words'}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-2xl sm:text-3xl font-black text-sky-400">
                  {Math.round((weeklyGoal.reviewedCount / Math.max(1, weeklyGoal.targetWords)) * 100)}%
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  {weeklyGoal.reviewedCount >= weeklyGoal.targetWords
                    ? (lang === 'vi' ? 'Đã đạt chỉ tiêu!' : 'Goal achieved!')
                    : (lang === 'vi'
                        ? `Còn ${Math.max(0, weeklyGoal.targetWords - weeklyGoal.reviewedCount)} từ nữa`
                        : `${Math.max(0, weeklyGoal.targetWords - weeklyGoal.reviewedCount)} remaining`)}
                </span>
              </div>
            </div>

            {/* Glowing Progress Track */}
            <div className="w-full bg-slate-800/80 rounded-full h-3.5 overflow-hidden p-0.5 border border-white/5">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out shadow-sm ${
                  weeklyGoal.reviewedCount >= weeklyGoal.targetWords
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-400 shadow-emerald-500/50'
                    : 'bg-gradient-to-r from-sky-400 via-indigo-400 to-pink-500 shadow-sky-500/50'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(3, Math.round((weeklyGoal.reviewedCount / Math.max(1, weeklyGoal.targetWords)) * 100)))}%`,
                }}
              />
            </div>

            {/* Motivation Badge & Tip */}
            {weeklyGoal.reviewedCount >= weeklyGoal.targetWords ? (
              <div className="mt-3 flex items-center gap-2 text-emerald-300 text-xs sm:text-sm font-semibold">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>
                  {lang === 'vi'
                    ? '🎉 Xuất sắc! Bạn đã hoàn thành toàn bộ mục tiêu tuần này. Hãy tiếp tục duy trì phong độ nhé!'
                    : '🎉 Awesome! You have completed your weekly review goal. Keep up the momentum!'}
                </span>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {lang === 'vi'
                      ? `Chỉ cần ôn thêm ~${Math.ceil((weeklyGoal.targetWords - weeklyGoal.reviewedCount) / Math.max(1, daysLeft))} từ/ngày là sẽ hoàn thành!`
                      : `Just review ~${Math.ceil((weeklyGoal.targetWords - weeklyGoal.reviewedCount) / Math.max(1, daysLeft))} words/day to achieve it!`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('chest')}
                  className="font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{lang === 'vi' ? 'Ôn ngay' : 'Review now'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Bottom Grid: Streak & 7-Day Habit Tracker */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Streak Card */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 flex-shrink-0">
                  <Flame className="w-6 h-6 fill-orange-400" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 block">
                    {lang === 'vi' ? 'Chuỗi học liên tục' : 'Current Streak'}
                  </span>
                  <span className="text-xl font-black text-white">
                    {streakData.currentStreak} {lang === 'vi' ? 'ngày liên tiếp' : 'days in a row'}
                  </span>
                </div>
              </div>

              <div className="text-right border-l border-white/10 pl-4">
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 justify-end">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  {lang === 'vi' ? 'Kỷ lục' : 'Record'}
                </span>
                <span className="text-base font-bold text-amber-300">
                  {streakData.bestStreak} {lang === 'vi' ? 'ngày' : 'days'}
                </span>
              </div>
            </div>

            {/* 7-Day Week Habit Calendar */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <span className="text-xs font-semibold text-slate-400 block mb-2.5">
                {lang === 'vi' ? 'Thói quen ôn tập trong tuần này:' : 'Review habits this week:'}
              </span>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {weekDays.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-center transition-all ${
                      day.isActive
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                        : day.isToday
                        ? 'bg-sky-500/20 border-sky-400/60 text-sky-200 ring-1 ring-sky-400/40'
                        : 'bg-white/5 border-white/5 text-slate-400'
                    }`}
                  >
                    <span className="text-[11px] font-bold block">{day.label}</span>
                    <div className="mt-1">
                      {day.isActive ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <span className="text-xs font-medium block">{day.dayNum}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<BookOpen className="w-5 h-5" />} label={t('totalWords')} value={vocabs.length} color="sky" />
        <StatCard icon={<Target className="w-5 h-5" />} label={t('quizAccuracy')} value={`${stats.quizAccuracy}%`} color="emerald" />
        <StatCard icon={<Award className="w-5 h-5" />} label={t('typingAccuracy')} value={`${stats.typingAccuracy}%`} color="teal" />
        <StatCard icon={<TrendingDown className="w-5 h-5" />} label={t('sentenceAccuracy')} value={`${stats.sentenceAccuracy}%`} color="indigo" />
      </div>

      {/* Accuracy breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4">{t('recentActivity')}</h3>
        {!hasData ? (
          <p className="text-sm text-slate-400 text-center py-8">{t('noDataYet')}</p>
        ) : (
          <div className="space-y-4">
            <AccuracyBar label={t('quizAccuracy')} value={stats.quizAccuracy} total={stats.quizTotal} correct={stats.quizCorrect} color="emerald" />
            <AccuracyBar label={t('typingAccuracy')} value={stats.typingAccuracy} total={stats.typingTotal} correct={stats.typingCorrect} color="teal" />
            <AccuracyBar label={t('sentenceAccuracy')} value={stats.sentenceAccuracy} total={stats.sentenceTotal} correct={Math.round(stats.sentenceTotal * stats.sentenceAccuracy / 100)} color="indigo" />
            <AccuracyBar label={t('clozeAccuracy')} value={stats.clozeAccuracy} total={stats.clozeTotal} correct={stats.clozeCorrect} color="sky" />
          </div>
        )}
      </div>

      {/* Words by category */}
      {categories.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">{t('wordsByCategory')}</h3>
          <div className="space-y-3">
            {categories.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-600 w-32 truncate">{cat}</span>
                <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-teal-400 rounded-lg transition-all duration-500 flex items-center justify-end px-2"
                    style={{ width: `${(count / maxCatCount) * 100}%` }}
                  >
                    <span className="text-xs font-bold text-white">{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weak words */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h3 className="font-bold text-slate-800">{t('weakWords')}</h3>
          </div>
          {weakWords.length > 0 && (
            <button
              onClick={() => onNavigate('quiz')}
              className="flex items-center gap-1.5 text-sm font-semibold text-sky-600 hover:text-sky-700 transition-colors"
            >
              {t('practiceWeakNow')}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
        {weakWords.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">{t('noWeakWords')}</p>
        ) : (
          <div className="space-y-2">
            {weakWords.map((word, i) => (
              <div
                key={word.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i < 3 ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-500'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{word.word}</span>
                    {word.type && <span className="text-xs text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">{word.type}</span>}
                  </div>
                  <p className="text-sm text-slate-500">{word.meaning}</p>
                </div>
                <button
                  onClick={() => speak(word.word)}
                  className="w-8 h-8 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-500 flex items-center justify-center transition-colors flex-shrink-0"
                  title={t('playAudio')}
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50">
                  <span className="text-sm font-bold text-rose-600">{word.error_count}</span>
                  <span className="text-xs text-rose-400">{t('errorCount').toLowerCase()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    teal: 'bg-teal-50 text-teal-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function AccuracyBar({ label, value, total, correct, color }: { label: string; value: number; total: number; correct: number; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500',
    teal: 'bg-teal-500',
    indigo: 'bg-indigo-500',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-slate-600">{label}</span>
        <span className="text-sm text-slate-500">
          {correct}/{total} ({value}%)
        </span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colors[color]}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
