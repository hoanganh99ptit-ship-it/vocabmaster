import { useState } from 'react';
import {
  Target,
  Check,
  Zap,
  Gift,
  ShieldAlert,
  Flame,
  Award,
  X,
  HelpCircle,
  Layers,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react';
import {
  DIFFICULTY_CONFIGS,
  calculateDifficulty,
  getPenaltyRequirements,
  setWeeklyCustomTargets,
  REWARD_SUGGESTIONS,
  type GoalDifficulty,
  type WeeklyGoal,
} from '@/lib/storage';
import { pushUserDataToCloud } from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';

interface WeeklyGoalSetupModalProps {
  currentGoal: WeeklyGoal;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (goal: WeeklyGoal) => void;
}

export function WeeklyGoalSetupModal({ currentGoal, isOpen, onClose, onSaved }: WeeklyGoalSetupModalProps) {
  const { lang } = useLanguage();
  const { theme } = useTheme();

  // Custom targets chosen by user
  const [quizTarget, setQuizTarget] = useState<number>(currentGoal.quizTarget || 30);
  const [clozeTarget, setClozeTarget] = useState<number>(currentGoal.clozeTarget || 20);
  const [rewardInput, setRewardInput] = useState(currentGoal.rewardText);

  if (!isOpen) return null;

  // Auto-classified difficulty based on the current chosen targets
  const currentDiff: GoalDifficulty = calculateDifficulty(quizTarget, clozeTarget);
  const currentCfg = DIFFICULTY_CONFIGS[currentDiff];
  const penaltyReq = getPenaltyRequirements(quizTarget, clozeTarget);
  const totalQuestions = quizTarget + clozeTarget;
  const avgPerDay = Math.round((totalQuestions / 7) * 10) / 10;

  const handleConfirm = () => {
    const updated = setWeeklyCustomTargets(quizTarget, clozeTarget, rewardInput);
    pushUserDataToCloud(true);
    onSaved(updated);
    onClose();
  };

  const handleApplyPreset = (diff: GoalDifficulty) => {
    const cfg = DIFFICULTY_CONFIGS[diff];
    setQuizTarget(cfg.quizTarget);
    setClozeTarget(cfg.clozeTarget);
  };

  const handleStepQuiz = (delta: number) => {
    setQuizTarget((prev) => Math.max(5, Math.min(500, prev + delta)));
  };

  const handleStepCloze = (delta: number) => {
    setClozeTarget((prev) => Math.max(5, Math.min(300, prev + delta)));
  };

  const presetDifficulties: GoalDifficulty[] = ['easy', 'medium', 'hard', 'nightmare'];
  const quizQuickChips = [15, 30, 50, 75, 100, 150];
  const clozeQuickChips = [10, 20, 35, 50, 70, 100];

  const getTierBadgeStyle = (tier: GoalDifficulty) => {
    switch (tier) {
      case 'easy':
        return {
          border: 'border-emerald-500/50',
          bg: 'bg-emerald-500/15 text-emerald-300',
          indicator: 'bg-emerald-400',
          glow: 'from-emerald-500/20 to-teal-500/10',
          gradientText: 'from-emerald-300 to-teal-200',
        };
      case 'medium':
        return {
          border: 'border-sky-500/50',
          bg: 'bg-sky-500/15 text-sky-300',
          indicator: 'bg-sky-400',
          glow: 'from-sky-500/20 to-indigo-500/10',
          gradientText: 'from-sky-300 to-cyan-200',
        };
      case 'hard':
        return {
          border: 'border-amber-500/50',
          bg: 'bg-amber-500/15 text-amber-300',
          indicator: 'bg-amber-400',
          glow: 'from-amber-500/20 to-orange-500/10',
          gradientText: 'from-amber-300 to-yellow-200',
        };
      case 'nightmare':
      default:
        return {
          border: 'border-rose-500/50',
          bg: 'bg-rose-500/15 text-rose-300',
          indicator: 'bg-rose-500',
          glow: 'from-rose-500/20 to-red-600/10',
          gradientText: 'from-rose-300 to-red-200',
        };
    }
  };

  const badgeStyle = getTierBadgeStyle(currentDiff);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className={`border rounded-3xl max-w-2xl w-full p-4 sm:p-7 shadow-2xl relative overflow-hidden max-h-[92vh] overflow-y-auto ${
          theme === 'cinema'
            ? 'bg-gradient-to-b from-[#18130e] via-[#241a12] to-[#140f0b] border-amber-500/40 text-amber-100 shadow-black/90'
            : 'bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 border-indigo-700/50 text-white'
        }`}
      >
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer z-20"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4 pr-10">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md flex-shrink-0 mt-0.5 ${
                theme === 'cinema'
                  ? 'bg-gradient-to-tr from-amber-500 to-yellow-600 text-stone-950 font-black'
                  : 'bg-gradient-to-tr from-sky-400 to-indigo-500 text-white'
              }`}
            >
              <Target className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  {lang === 'vi' ? 'Thiết lập Thử thách tuần mới' : 'Customize Weekly Challenge'}
                </h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  {currentGoal.weekKey}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-stone-300 mt-1 leading-snug">
                {lang === 'vi'
                  ? 'Chọn số lượng câu ôn tập theo ý muốn. Hệ thống sẽ tự động xếp hạng độ khó & áp dụng hình phạt kỷ luật tương ứng!'
                  : 'Pick your weekly target volumes. The system will auto-classify the challenge level & consequence!'}
              </p>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="mb-4 p-2.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{lang === 'vi' ? '⚡ Mẫu gợi ý nhanh:' : '⚡ Quick Presets:'}</span>
              </span>
              <span className="text-[10px] text-slate-400">
                {lang === 'vi' ? 'Nhấn để điền nhanh khối lượng' : 'Click to load presets'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {presetDifficulties.map((diffKey) => {
                const cfg = DIFFICULTY_CONFIGS[diffKey];
                const isCurrentTier = currentDiff === diffKey;
                return (
                  <button
                    key={diffKey}
                    type="button"
                    onClick={() => handleApplyPreset(diffKey)}
                    className={`px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isCurrentTier
                        ? 'bg-sky-500/25 border-sky-400 text-white shadow-xs'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-black">
                      <span>{cfg.nameVi}</span>
                      {isCurrentTier && <Check className="w-3 h-3 text-sky-400 stroke-[3]" />}
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {cfg.quizTarget} Quiz • {cfg.clozeTarget} Cloze
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dual Target Selectors (Quiz & Cloze) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
            {/* Target 1: Trắc nghiệm (Quiz) */}
            <div className="p-4 rounded-2xl bg-white/5 border border-sky-400/25 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm">
                      {lang === 'vi' ? 'Trắc nghiệm (Quiz)' : 'Multiple Choice'}
                    </h3>
                    <span className="text-[11px] text-slate-400 block">
                      {lang === 'vi' ? 'Ôn phản xạ từ vựng' : 'Fast recall'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Number Stepper Control */}
              <div className="flex items-center justify-center gap-2 mb-3 bg-black/30 p-2 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => handleStepQuiz(-5)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
                  title="-5 câu"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="flex items-baseline gap-1">
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={quizTarget}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setQuizTarget(Math.max(5, Math.min(500, val)));
                    }}
                    className="w-16 text-center text-2xl font-black bg-transparent text-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-400 rounded-lg"
                  />
                  <span className="text-xs font-semibold text-slate-400">
                    {lang === 'vi' ? 'câu/tuần' : 'q/wk'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleStepQuiz(5)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
                  title="+5 câu"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Chips */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {quizQuickChips.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuizTarget(num)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      quizTarget === num
                        ? 'bg-sky-500 text-white shadow-xs'
                        : 'bg-white/10 hover:bg-white/20 text-slate-300'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Target 2: Đục lỗ ngữ cảnh (Cloze Test) */}
            <div className="p-4 rounded-2xl bg-white/5 border border-emerald-400/25 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm">
                      {lang === 'vi' ? 'Đục lỗ ngữ cảnh' : 'Context Cloze'}
                    </h3>
                    <span className="text-[11px] text-slate-400 block">
                      {lang === 'vi' ? 'Hiểu sâu cách dùng từ' : 'Sentence filling'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Number Stepper Control */}
              <div className="flex items-center justify-center gap-2 mb-3 bg-black/30 p-2 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => handleStepCloze(-5)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
                  title="-5 câu"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="flex items-baseline gap-1">
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={clozeTarget}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setClozeTarget(Math.max(5, Math.min(300, val)));
                    }}
                    className="w-16 text-center text-2xl font-black bg-transparent text-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded-lg"
                  />
                  <span className="text-xs font-semibold text-slate-400">
                    {lang === 'vi' ? 'câu/tuần' : 'q/wk'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleStepCloze(5)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer"
                  title="+5 câu"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Chips */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {clozeQuickChips.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setClozeTarget(num)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      clozeTarget === num
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-white/10 hover:bg-white/20 text-slate-300'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Real-Time Auto-Classification Card */}
          <div
            className={`p-4 rounded-2xl border-2 transition-all mb-4 bg-gradient-to-r ${badgeStyle.glow} ${badgeStyle.border}`}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${badgeStyle.indicator} animate-ping`} />
                <span className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                  {lang === 'vi' ? 'Hệ thống tự động xếp hạng:' : 'System Auto-Classification:'}
                </span>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${badgeStyle.bg} ${badgeStyle.border}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Mức {currentCfg.nameVi}</span>
              </div>
            </div>

            <div className="text-xs text-slate-200 space-y-1">
              <p className="font-semibold text-white">
                💡 {currentCfg.descriptionVi}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-slate-300 pt-1">
                <span>
                  Tổng cộng: <strong className="text-white font-bold">{totalQuestions} câu/tuần</strong>
                </span>
                <span>•</span>
                <span>
                  Trung bình: <strong className="text-white font-bold">~{avgPerDay} câu/ngày</strong>
                </span>
              </div>
            </div>

            {/* Penalty Consequence Preview */}
            <div className="mt-3 pt-2.5 border-t border-white/15 flex items-start gap-2 text-xs">
              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="text-slate-300 text-[11px] leading-relaxed">
                <strong className="text-rose-300 font-bold block">
                  {lang === 'vi' ? 'Hình phạt kỷ luật nếu không hoàn thành trước Chủ Nhật:' : 'Penalty consequence if missed:'}
                </strong>
                <span>
                  {lang === 'vi'
                    ? `Ứng dụng sẽ tự động khóa và yêu cầu hoàn thành `
                    : `App will lock until you complete `}
                  <strong className="text-amber-300">{penaltyReq.penaltyQuiz} câu Quiz</strong> &{' '}
                  <strong className="text-emerald-300">{penaltyReq.penaltyCloze} câu Đục lỗ</strong>{' '}
                  {lang === 'vi' ? 'để mở lại quyền truy cập!' : 'to unlock!'}
                </span>
              </div>
            </div>
          </div>

          {/* Reward Input & Suggestions */}
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 mb-5">
            <label className="block text-xs font-bold text-emerald-300 mb-1.5 flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-emerald-400" />
              <span>
                {lang === 'vi'
                  ? 'Phần thưởng tự trao khi hoàn thành trọn vẹn thử thách:'
                  : 'Reward upon completion:'}
              </span>
            </label>
            <input
              type="text"
              value={rewardInput}
              onChange={(e) => setRewardInput(e.target.value)}
              placeholder="Ví dụ: Tự thưởng 1 ly trà sữa trân châu đường đen 🧋"
              className="w-full bg-slate-800/90 border border-white/20 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors"
            />
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <span className="text-[11px] text-slate-400">{lang === 'vi' ? 'Gợi ý:' : 'Quick ideas:'}</span>
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

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 transition-all cursor-pointer text-center"
            >
              {lang === 'vi' ? 'Để sau' : 'Later'}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`px-6 py-3 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg ${
                theme === 'cinema'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-stone-950 shadow-amber-500/30'
                  : 'text-white bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 shadow-indigo-500/30'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>
                {lang === 'vi'
                  ? `Ký cam kết Mức ${currentCfg.nameVi} (${totalQuestions} câu) ✍️`
                  : `Commit to Level ${currentCfg.nameEn} (${totalQuestions} q) ✍️`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
