import { useState } from 'react';
import {
  Target,
  Check,
  Zap,
  Gift,
  ShieldAlert,
  Flame,
  Award,
  Calendar,
  X,
} from 'lucide-react';
import {
  DIFFICULTY_CONFIGS,
  setWeeklyDifficulty,
  updateWeeklyGoal,
  REWARD_SUGGESTIONS,
  type GoalDifficulty,
  type WeeklyGoal,
} from '@/lib/storage';
import { useLanguage } from '@/context/LanguageContext';

interface WeeklyGoalSetupModalProps {
  currentGoal: WeeklyGoal;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (goal: WeeklyGoal) => void;
}

export function WeeklyGoalSetupModal({ currentGoal, isOpen, onClose, onSaved }: WeeklyGoalSetupModalProps) {
  const { lang } = useLanguage();
  const [selectedDifficulty, setSelectedDifficulty] = useState<GoalDifficulty>(currentGoal.difficulty || 'medium');
  const [rewardInput, setRewardInput] = useState(currentGoal.rewardText);

  if (!isOpen) return null;

  const currentCfg = DIFFICULTY_CONFIGS[selectedDifficulty];

  const handleConfirm = () => {
    // Save difficulty & reward
    setWeeklyDifficulty(selectedDifficulty);
    const updated = updateWeeklyGoal({
      rewardText: rewardInput,
      difficultyChosenForWeek: true,
    });
    onSaved(updated);
    onClose();
  };

  const difficulties: GoalDifficulty[] = ['easy', 'medium', 'hard', 'nightmare'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 border border-indigo-700/50 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl text-white relative overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-500/30 flex-shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>{lang === 'vi' ? 'Xác lập Mục tiêu tuần mới' : 'Set Weekly Goal & Difficulty'}</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">
                  {currentGoal.weekKey}
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                {lang === 'vi'
                  ? 'Chọn 1 trong 4 mức độ mục tiêu tuần. Hệ thống sẽ tự động đưa ra hình phạt tương ứng!'
                  : 'Select 1 of 4 difficulty levels. The system will automatically assign the penalty tasks!'}
              </p>
            </div>
          </div>

          {/* 4 Difficulty Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
            {difficulties.map((diffKey) => {
              const cfg = DIFFICULTY_CONFIGS[diffKey];
              const isSelected = selectedDifficulty === diffKey;

              return (
                <div
                  key={diffKey}
                  onClick={() => setSelectedDifficulty(diffKey)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-indigo-900/60 border-sky-400 shadow-lg shadow-sky-500/20 scale-[1.01]'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${
                        diffKey === 'easy' ? 'bg-emerald-400' :
                        diffKey === 'medium' ? 'bg-sky-400' :
                        diffKey === 'hard' ? 'bg-amber-400' : 'bg-rose-500'
                      }`} />
                      <h4 className="font-black text-white text-base">
                        {cfg.nameVi}
                      </h4>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-sky-400 text-slate-950 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-300 mb-3 line-clamp-1">
                    {cfg.descriptionVi}
                  </p>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-200">
                      <span>🎯 Trắc nghiệm:</span>
                      <strong className="text-white font-black">{cfg.quizTarget} từ / tuần</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <span>🧩 Đục lỗ ngữ cảnh:</span>
                      <strong className="text-white font-black">{cfg.clozeTarget} câu / tuần</strong>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/10 text-[11px] text-rose-300">
                    <span className="font-bold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>Hình phạt nếu thiếu:</span>
                    </span>
                    <span className="text-slate-300 block mt-0.5">
                      Khóa app: Phạt <strong>{cfg.penaltyQuiz} Quiz</strong> & <strong>{cfg.penaltyCloze} Cloze</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reward Input & Suggestions */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-5">
            <label className="block text-xs font-bold text-emerald-300 mb-1.5 flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-emerald-400" />
              <span>{lang === 'vi' ? 'Phần thưởng tự trao khi hoàn thành cả 2 mục tiêu:' : 'Reward upon completion:'}</span>
            </label>
            <input
              type="text"
              value={rewardInput}
              onChange={(e) => setRewardInput(e.target.value)}
              placeholder="Ví dụ: Tự thưởng 1 ly trà sữa trân châu đường đen 🧋"
              className="w-full bg-slate-800/90 border border-white/20 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 transition-colors"
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

          {/* Summary Box */}
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-slate-300 mb-5 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-rose-300 block font-bold mb-0.5">
                {lang === 'vi' ? 'Quy chế phạt tự động của hệ thống:' : 'Automatic system penalty rules:'}
              </strong>
              <span>
                {lang === 'vi'
                  ? `Nếu hết tuần bạn không đạt đủ cả ${currentCfg.quizTarget} trắc nghiệm và ${currentCfg.clozeTarget} câu đục lỗ, ứng dụng sẽ tự động khóa và bắt buộc bạn hoàn thành ${currentCfg.penaltyQuiz} câu trắc nghiệm phạt & ${currentCfg.penaltyCloze} câu đục lỗ phạt để mở lại!`
                  : `If targets are missed by Sunday, the app will automatically lock until you complete ${currentCfg.penaltyQuiz} Quiz & ${currentCfg.penaltyCloze} Cloze questions!`}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
            >
              {lang === 'vi' ? 'Để sau' : 'Later'}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black text-white bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 shadow-lg shadow-indigo-500/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <Award className="w-4 h-4" />
              <span>{lang === 'vi' ? 'Ký cam kết & Bắt đầu tuần này ✍️' : 'Commit & Start Week ✍️'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
