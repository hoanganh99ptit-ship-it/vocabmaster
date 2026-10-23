import { useMemo, useState, useEffect } from 'react';
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
  Gift,
  HelpCircle,
  Layers,
  Edit3,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { speak } from '@/lib/speech';
import {
  getPracticeHistory,
  getWeeklyGoal,
  updateWeeklyGoal,
  setWeeklyDifficulty,
  activatePenalty,
  clearActivePenalty,
  getActivePenalty,
  getStreakData,
  getDaysLeftInWeek,
  triggerWeeklyCelebrationPopup,
  DIFFICULTY_CONFIGS,
  REWARD_SUGGESTIONS,
  type PracticeRecord,
  type WeeklyGoal,
  type StreakData,
  type GoalDifficulty,
  type ActivePenalty,
} from '@/lib/storage';
import { pushUserDataToCloud } from '@/lib/cloudSync';
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
  const [activePenalty, setActivePenaltyState] = useState<ActivePenalty>(() => getActivePenalty());
  const daysLeft = useMemo(() => getDaysLeftInWeek(), []);

  // Contract editing state (only reward is user-editable, penalty is system-calculated)
  const [isEditingContract, setIsEditingContract] = useState(false);
  const [rewardInput, setRewardInput] = useState(weeklyGoal.rewardText);

  // Sync state if remote updates arrive
  useEffect(() => {
    const handleSync = () => {
      const g = getWeeklyGoal();
      setWeeklyGoalState(g);
      setStreakDataState(getStreakData());
      setActivePenaltyState(getActivePenalty());
      setRewardInput(g.rewardText);
    };
    window.addEventListener('vocabmaster_sync_completed', handleSync);
    return () => window.removeEventListener('vocabmaster_sync_completed', handleSync);
  }, []);

  const handleSelectDifficulty = (diff: GoalDifficulty) => {
    const updated = setWeeklyDifficulty(diff);
    setWeeklyGoalState({ ...updated });
    pushUserDataToCloud(true);
  };

  const handleSelectQuizTarget = (target: number) => {
    const updated = updateWeeklyGoal({ quizTarget: target });
    setWeeklyGoalState({ ...updated });
    pushUserDataToCloud(true);
  };

  const handleSelectClozeTarget = (target: number) => {
    const updated = updateWeeklyGoal({ clozeTarget: target });
    setWeeklyGoalState({ ...updated });
    pushUserDataToCloud(true);
  };

  const handleSaveContract = () => {
    const updated = updateWeeklyGoal({
      rewardText: rewardInput,
    });
    setWeeklyGoalState({ ...updated });
    setIsEditingContract(false);
    pushUserDataToCloud(true);
  };

  const handleCancelContract = () => {
    setRewardInput(weeklyGoal.rewardText);
    setIsEditingContract(false);
  };

  const handleTriggerTestPenalty = () => {
    const pen = activatePenalty(weeklyGoal.difficulty, weeklyGoal.weekKey);
    setActivePenaltyState(pen);
    pushUserDataToCloud(true);
  };

  const handleClearPenalty = () => {
    clearActivePenalty();
    setActivePenaltyState(getActivePenalty());
    pushUserDataToCloud(true);
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/25 flex-shrink-0">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {lang === 'vi' ? 'Mục tiêu ôn tập & Khế ước tuần này' : 'Weekly Goals & Commitment'}
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

            {/* Quick Reward Edit Button */}
            <button
              type="button"
              onClick={() => setIsEditingContract(!isEditingContract)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/15 text-sky-200 hover:text-white transition-all cursor-pointer self-start md:self-center"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingContract ? (lang === 'vi' ? 'Đóng chỉnh sửa' : 'Close Editor') : (lang === 'vi' ? 'Đổi phần thưởng 🎁' : 'Edit Reward 🎁')}</span>
            </button>
          </div>

          {/* 4 Difficulty Levels Selector (Dễ, Trung Bình, Khó, Địa ngục) */}
          <div className="mb-6 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{lang === 'vi' ? 'Cấp độ thử thách tuần này:' : 'Weekly Challenge Level:'}</span>
              </span>
              <span className="text-[11px] text-slate-400">
                {lang === 'vi' ? 'Hình phạt tự động điều chỉnh theo độ khó' : 'Penalty auto-calculated per level'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['easy', 'medium', 'hard', 'nightmare'] as GoalDifficulty[]).map((diffKey) => {
                const cfg = DIFFICULTY_CONFIGS[diffKey];
                const isSelected = weeklyGoal.difficulty === diffKey;

                return (
                  <button
                    key={diffKey}
                    type="button"
                    onClick={() => handleSelectDifficulty(diffKey)}
                    className={`py-2 px-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/20 border-sky-400 shadow-md shadow-sky-500/20 text-white'
                        : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-black flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          diffKey === 'easy' ? 'bg-emerald-400' :
                          diffKey === 'medium' ? 'bg-sky-400' :
                          diffKey === 'hard' ? 'bg-amber-400' : 'bg-rose-500'
                        }`} />
                        {cfg.nameVi}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 stroke-[3]" />}
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      {cfg.quizTarget} Quiz • {cfg.clozeTarget} Cloze
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Victory Celebration Banner (When both goals completed) */}
          {(() => {
            const isWeeklyAchieved = weeklyGoal.quizReviewed >= weeklyGoal.quizTarget && weeklyGoal.clozeReviewed >= weeklyGoal.clozeTarget;
            if (!isWeeklyAchieved) return null;
            return (
              <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-amber-500/20 border border-emerald-400/40 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 animate-bounce-subtle">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 flex-shrink-0">
                    <Trophy className="w-7 h-7" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-black text-emerald-300 text-sm sm:text-base flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>{lang === 'vi' ? 'XUẤT SẮC! BẠN ĐÃ ĐẠT TOÀN BỘ MỤC TIÊU TUẦN NÀY!' : 'EXCELLENT! YOU ACHIEVED ALL WEEKLY GOALS!'}</span>
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-200 mt-0.5">
                      {lang === 'vi'
                        ? `Khế ước cam kết thành công — Hãy nhận phần thưởng: `
                        : `Commitment fulfilled — Enjoy your reward: `}
                      <strong className="text-amber-300 font-bold underline decoration-amber-400/60">{weeklyGoal.rewardText}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => triggerWeeklyCelebrationPopup(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0 self-start sm:self-center"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>{lang === 'vi' ? 'Xem lại vinh danh 🎉' : 'View Celebration 🎉'}</span>
                </button>
              </div>
            );
          })()}

          {/* Dual Per-Feature Goals Grid (Quiz & Cloze Test) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Goal 1: Luyện trắc nghiệm (Quiz) */}
            {(() => {
              const quizPercent = Math.min(100, Math.round((weeklyGoal.quizReviewed / Math.max(1, weeklyGoal.quizTarget)) * 100));
              const isQuizAchieved = weeklyGoal.quizReviewed >= weeklyGoal.quizTarget;

              return (
                <div className="bg-white/5 rounded-2xl p-5 border border-sky-400/20 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                          <HelpCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-black text-white text-sm sm:text-base">
                            {lang === 'vi' ? 'Luyện trắc nghiệm (Quiz)' : 'Multiple Choice Quiz'}
                          </h3>
                          <span className="text-[11px] text-slate-400 block">
                            {lang === 'vi' ? 'Ôn phản xạ nhanh nghĩa từ vựng' : 'Fast active recall practice'}
                          </span>
                        </div>
                      </div>

                      {/* Target Selectors */}
                      <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/10">
                        {[15, 30, 60, 100].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleSelectQuizTarget(num)}
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              weeklyGoal.quizTarget === num
                                ? 'bg-sky-500 text-white shadow-xs'
                                : 'text-slate-300 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress Numbers */}
                    <div className="flex items-baseline justify-between mb-2 mt-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black text-white">{weeklyGoal.quizReviewed}</span>
                        <span className="text-sm font-semibold text-slate-400">/ {weeklyGoal.quizTarget} {lang === 'vi' ? 'từ' : 'words'}</span>
                      </div>
                      <span className="text-xl font-black text-sky-400">{quizPercent}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-white/5 mb-3">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isQuizAchieved
                            ? 'bg-gradient-to-r from-emerald-400 to-teal-400 shadow-emerald-500/40'
                            : 'bg-gradient-to-r from-sky-400 to-indigo-500 shadow-sky-500/40'
                        }`}
                        style={{ width: `${quizPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer status & Action */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
                    <span className={isQuizAchieved ? 'text-emerald-300 font-bold flex items-center gap-1' : 'text-slate-300'}>
                      {isQuizAchieved ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{lang === 'vi' ? 'Đã đạt chỉ tiêu tuần!' : 'Target achieved!'}</span>
                        </>
                      ) : (
                        lang === 'vi'
                          ? `Còn ${Math.max(0, weeklyGoal.quizTarget - weeklyGoal.quizReviewed)} từ nữa`
                          : `${Math.max(0, weeklyGoal.quizTarget - weeklyGoal.quizReviewed)} words remaining`
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('quiz')}
                      className="font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>{lang === 'vi' ? 'Luyện ngay' : 'Practice'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Goal 2: Đục lỗ ngữ cảnh (Cloze Test) */}
            {(() => {
              const clozePercent = Math.min(100, Math.round((weeklyGoal.clozeReviewed / Math.max(1, weeklyGoal.clozeTarget)) * 100));
              const isClozeAchieved = weeklyGoal.clozeReviewed >= weeklyGoal.clozeTarget;

              return (
                <div className="bg-white/5 rounded-2xl p-5 border border-emerald-400/20 backdrop-blur-sm relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-black text-white text-sm sm:text-base">
                            {lang === 'vi' ? 'Đục lỗ ngữ cảnh (Cloze)' : 'Context Cloze Test'}
                          </h3>
                          <span className="text-[11px] text-slate-400 block">
                            {lang === 'vi' ? 'Nhớ sâu cách dùng từ trong câu' : 'In-context sentence filling'}
                          </span>
                        </div>
                      </div>

                      {/* Target Selectors */}
                      <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/10">
                        {[10, 20, 40, 70].map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => handleSelectClozeTarget(num)}
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              weeklyGoal.clozeTarget === num
                                ? 'bg-emerald-500 text-white shadow-xs'
                                : 'text-slate-300 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress Numbers */}
                    <div className="flex items-baseline justify-between mb-2 mt-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-black text-white">{weeklyGoal.clozeReviewed}</span>
                        <span className="text-sm font-semibold text-slate-400">/ {weeklyGoal.clozeTarget} {lang === 'vi' ? 'câu' : 'sentences'}</span>
                      </div>
                      <span className="text-xl font-black text-emerald-400">{clozePercent}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-white/5 mb-3">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isClozeAchieved
                            ? 'bg-gradient-to-r from-emerald-400 to-teal-400 shadow-emerald-500/40'
                            : 'bg-gradient-to-r from-emerald-400 to-teal-500 shadow-emerald-500/40'
                        }`}
                        style={{ width: `${clozePercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Footer status & Action */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
                    <span className={isClozeAchieved ? 'text-emerald-300 font-bold flex items-center gap-1' : 'text-slate-300'}>
                      {isClozeAchieved ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{lang === 'vi' ? 'Đã đạt chỉ tiêu tuần!' : 'Target achieved!'}</span>
                        </>
                      ) : (
                        lang === 'vi'
                          ? `Còn ${Math.max(0, weeklyGoal.clozeTarget - weeklyGoal.clozeReviewed)} câu nữa`
                          : `${Math.max(0, weeklyGoal.clozeTarget - weeklyGoal.clozeReviewed)} sentences remaining`
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('cloze')}
                      className="font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>{lang === 'vi' ? 'Luyện ngay' : 'Practice'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Kế hoạch Thưởng - Phạt (Khế ước cam kết kỷ luật) */}
          <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-sm mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-400/30 flex items-center justify-center text-pink-300">
                  <Gift className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-sm sm:text-base">
                    {lang === 'vi' ? 'Kế hoạch Thưởng - Phạt tuần này' : 'Weekly Reward & System Penalty'}
                  </h3>
                  <span className="text-[11px] text-slate-300 block">
                    {lang === 'vi'
                      ? 'Hình phạt ứng với chức năng do hệ thống tự động đưa ra theo độ khó đã chọn.'
                      : 'Penalty tasks are auto-generated based on your chosen difficulty level.'}
                  </span>
                </div>
              </div>

              {!isEditingContract && (
                <button
                  type="button"
                  onClick={() => setIsEditingContract(true)}
                  className="text-xs font-bold text-sky-300 hover:text-white px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{lang === 'vi' ? 'Sửa phần thưởng' : 'Edit Reward'}</span>
                </button>
              )}
            </div>

            {/* View Mode */}
            {!isEditingContract ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Reward Card */}
                <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-950/60 to-slate-900/60 border border-emerald-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Gift className="w-4 h-4 text-emerald-400" />
                        <span>{lang === 'vi' ? 'Phần thưởng tự trao' : 'Reward'}</span>
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {weeklyGoal.quizReviewed >= weeklyGoal.quizTarget && weeklyGoal.clozeReviewed >= weeklyGoal.clozeTarget
                          ? (lang === 'vi' ? '🎉 ĐÃ MỞ KHÓA' : '🎉 UNLOCKED')
                          : (lang === 'vi' ? '⏳ Khi đạt cả 2 chỉ tiêu' : '⏳ On completion')}
                      </span>
                    </div>
                    <p className="text-base font-bold text-white mt-1">
                      {weeklyGoal.rewardText}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3 pt-2 border-t border-white/10">
                    {lang === 'vi'
                      ? 'Đạt cả chỉ tiêu Trắc nghiệm & Đục lỗ trước chủ nhật để nhận thưởng.'
                      : 'Achieve both Quiz & Cloze targets before Sunday to enjoy this reward.'}
                  </p>
                </div>

                {/* System-Generated Penalty Card */}
                <div className="rounded-xl p-4 bg-gradient-to-br from-rose-950/60 via-slate-900/60 to-rose-950/60 border border-rose-500/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-rose-400" />
                        <span>{lang === 'vi' ? 'Hình phạt tự động của hệ thống' : 'System Auto Penalty'}</span>
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {activePenalty.isActive
                          ? (lang === 'vi' ? '⚡ ĐANG BỊ KHÓA' : '⚡ LOCKED')
                          : (lang === 'vi' ? `Mức: ${DIFFICULTY_CONFIGS[weeklyGoal.difficulty].nameVi}` : `Level: ${DIFFICULTY_CONFIGS[weeklyGoal.difficulty].nameEn}`)}
                      </span>
                    </div>

                    <p className="text-sm sm:text-base font-bold text-rose-200 mt-1">
                      {weeklyGoal.penaltyText}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-400">
                      {activePenalty.isActive
                        ? (lang === 'vi' ? `Tiến độ: Quiz ${activePenalty.quizDone}/${activePenalty.quizRequired} • Cloze ${activePenalty.clozeDone}/${activePenalty.clozeRequired}` : `Progress: Quiz ${activePenalty.quizDone}/${activePenalty.quizRequired}`)
                        : (lang === 'vi' ? 'Khóa ứng dụng nếu hết tuần chưa đạt mục tiêu' : 'Locks app if targets missed')}
                    </span>

                    {/* Simulation / Test Penalty Button */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => triggerWeeklyCelebrationPopup(true)}
                        className="text-[11px] font-bold text-amber-300 hover:text-white px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 transition-all cursor-pointer"
                        title={lang === 'vi' ? 'Xem thử pop-up chúc mừng hoàn thành thử thách tuần' : 'Test weekly completion celebration popup'}
                      >
                        {lang === 'vi' ? 'Thử pop-up mừng 🎉' : 'Test Pop-up 🎉'}
                      </button>

                      {activePenalty.isActive ? (
                        <button
                          type="button"
                          onClick={handleClearPenalty}
                          className="text-[11px] font-bold text-emerald-300 hover:text-white px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all cursor-pointer"
                        >
                          {lang === 'vi' ? 'Hủy chế độ phạt 🔓' : 'Clear Penalty 🔓'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleTriggerTestPenalty}
                          className="text-[11px] font-bold text-rose-300 hover:text-white px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 transition-all cursor-pointer"
                          title={lang === 'vi' ? 'Kích hoạt thử thách phạt để trải nghiệm cơ chế khóa app' : 'Simulate lockout to test penalty mechanics'}
                        >
                          {lang === 'vi' ? 'Thử nghiệm khóa phạt ⚡' : 'Test Lockout ⚡'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Edit Mode: Only Reward is user editable */
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-emerald-300 mb-1.5">
                    🎁 {lang === 'vi' ? 'Phần thưởng tự trao khi hoàn thành cả 2 chỉ tiêu:' : 'Reward upon completion:'}
                  </label>
                  <input
                    type="text"
                    value={rewardInput}
                    onChange={(e) => setRewardInput(e.target.value)}
                    placeholder={lang === 'vi' ? 'Ví dụ: Tự thưởng 1 ly trà sữa trân châu đường đen 🧋' : 'e.g. Treat myself to boba milk tea 🧋'}
                    className="w-full bg-slate-800/90 border border-white/20 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[11px] text-slate-400">{lang === 'vi' ? 'Gợi ý nhanh:' : 'Quick ideas:'}</span>
                    {REWARD_SUGGESTIONS.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRewardInput(sug)}
                        className="text-[11px] px-2 py-0.5 rounded-lg bg-white/10 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-300 transition-colors cursor-pointer"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300">
                  <span className="text-amber-300 font-bold block mb-1">
                    ⚡ Hình phạt hệ thống hiện tại (Mức {DIFFICULTY_CONFIGS[weeklyGoal.difficulty].nameVi}):
                  </span>
                  <span>{weeklyGoal.penaltyText}</span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleCancelContract}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
                  >
                    {lang === 'vi' ? 'Hủy' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveContract}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-md shadow-emerald-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{lang === 'vi' ? 'Lưu phần thưởng' : 'Save Reward'}</span>
                  </button>
                </div>
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
