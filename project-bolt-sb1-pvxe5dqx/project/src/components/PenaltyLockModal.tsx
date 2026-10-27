import { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  AlertTriangle,
  Zap,
  HelpCircle,
  Layers,
  ArrowRight,
  Sparkles,
  Trophy,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import {
  getActivePenalty,
  clearActivePenalty,
  DIFFICULTY_CONFIGS,
  type ActivePenalty,
} from '@/lib/storage';
import { syncUserDataWithCloud, pushUserDataToCloud } from '@/lib/cloudSync';
import { useLanguage } from '@/context/LanguageContext';
import type { TabKey } from '@/lib/types';

interface PenaltyLockModalProps {
  onNavigateToPractice: (tab: TabKey) => void;
  onUnlocked?: () => void;
}

export function PenaltyLockModal({ onNavigateToPractice, onUnlocked }: PenaltyLockModalProps) {
  const { lang } = useLanguage();
  const [penalty, setPenalty] = useState<ActivePenalty>(() => getActivePenalty());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    // Listen for cloud synchronization events
    const handleSync = () => {
      const updated = getActivePenalty();
      setPenalty(updated);
      if (!updated.isActive && onUnlocked) {
        onUnlocked();
      }
    };
    window.addEventListener('vocabmaster_sync_completed', handleSync);

    // Poll penalty status occasionally to reflect instant updates from practice
    const interval = setInterval(() => {
      const current = getActivePenalty();
      setPenalty(current);
      if (!current.isActive && onUnlocked) {
        onUnlocked();
      }
    }, 1000);

    return () => {
      window.removeEventListener('vocabmaster_sync_completed', handleSync);
      clearInterval(interval);
    };
  }, [onUnlocked]);

  const handleSyncCloud = async () => {
    setIsSyncing(true);
    try {
      await syncUserDataWithCloud();
      const updated = getActivePenalty();
      setPenalty(updated);
      if (!updated.isActive && onUnlocked) {
        onUnlocked();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDirectUnlock = async () => {
    setIsSyncing(true);
    try {
      clearActivePenalty();
      await pushUserDataToCloud(true);
      setPenalty(getActivePenalty());
      if (onUnlocked) onUnlocked();
    } finally {
      setIsSyncing(false);
    }
  };

  if (!penalty.isActive) return null;

  const diffConfig = DIFFICULTY_CONFIGS[penalty.difficulty] || DIFFICULTY_CONFIGS.medium;
  const isAllResolved = penalty.quizDone >= penalty.quizRequired && penalty.clozeDone >= penalty.clozeRequired;

  const quizPercent = Math.min(100, Math.round((penalty.quizDone / Math.max(1, penalty.quizRequired)) * 100));
  const clozePercent = Math.min(100, Math.round((penalty.clozeDone / Math.max(1, penalty.clozeRequired)) * 100));

  const handleUnlock = () => {
    clearActivePenalty();
    setPenalty(getActivePenalty());
    if (onUnlocked) onUnlocked();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-rose-950 border-2 border-rose-500/50 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl text-white relative overflow-hidden">
        {/* Glow lighting decoration */}
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 text-center">
          {/* Lock Icon Banner */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-rose-500/20 border-2 border-rose-400/50 flex items-center justify-center shadow-lg shadow-rose-500/30 mb-4 animate-pulse">
            {isAllResolved ? (
              <Unlock className="w-9 h-9 sm:w-10 sm:h-10 text-emerald-400" />
            ) : (
              <Lock className="w-9 h-9 sm:w-10 sm:h-10 text-rose-400" />
            )}
          </div>

          {/* Heading */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-rose-300 text-xs font-black uppercase tracking-wider mb-2">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{lang === 'vi' ? 'Khóa ứng dụng • Thi hành hình phạt' : 'App Locked • Enforcing Penalty'}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {isAllResolved
              ? (lang === 'vi' ? '🎉 BẠN ĐÃ HOÀN THÀNH HÌNH PHẠT!' : '🎉 PENALTY CLEARED!')
              : (lang === 'vi' ? 'HỆ THỐNG ĐÃ BỊ TẠM KHÓA' : 'APPLICATION CURRENTLY LOCKED')}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
            {isAllResolved
              ? (lang === 'vi'
                  ? 'Tuyệt vời! Bạn đã hoàn thành toàn bộ bài tập phạt để chuộc lỗi. Hãy bấm nút bên dưới để mở khóa ứng dụng.'
                  : 'Great job! You have completed all penalty tasks. Click below to unlock all features.')
              : (lang === 'vi'
                  ? `Bạn chưa hoàn thành mục tiêu tuần trước (Mức độ: ${diffConfig.nameVi}). Theo khế ước cam kết kỷ luật, toàn bộ tính năng bị tạm khóa cho đến khi bạn hoàn thành hình phạt:`
                  : `You missed last week review targets (${diffConfig.nameEn} level). All features are locked until you complete the required penalty tasks:`)}
          </p>

          {/* Penalty Tasks Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-6 text-left">
            {/* Task 1: Quiz Penalty */}
            <div className={`p-4 rounded-2xl border transition-all ${
              penalty.quizDone >= penalty.quizRequired
                ? 'bg-emerald-950/40 border-emerald-400/40 text-emerald-200'
                : 'bg-slate-800/80 border-rose-500/30 text-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black">
                    {lang === 'vi' ? 'Trắc nghiệm phạt' : 'Quiz Penalty'}
                  </span>
                </div>
                <span className="text-xs font-black text-rose-300">
                  {penalty.quizDone}/{penalty.quizRequired}
                </span>
              </div>

              <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden mb-3 border border-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    penalty.quizDone >= penalty.quizRequired
                      ? 'bg-emerald-400'
                      : 'bg-gradient-to-r from-rose-500 to-amber-500'
                  }`}
                  style={{ width: `${quizPercent}%` }}
                />
              </div>

              <button
                type="button"
                onClick={() => onNavigateToPractice('quiz')}
                disabled={penalty.quizDone >= penalty.quizRequired}
                className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  penalty.quizDone >= penalty.quizRequired
                    ? 'bg-emerald-500/20 text-emerald-300 cursor-default'
                    : 'bg-sky-500 hover:bg-sky-400 text-white shadow-md shadow-sky-500/30'
                }`}
              >
                <span>
                  {penalty.quizDone >= penalty.quizRequired
                    ? (lang === 'vi' ? '✓ Đã xong' : '✓ Cleared')
                    : (lang === 'vi' ? 'Làm bài phạt Quiz ngay' : 'Do Quiz Penalty')}
                </span>
                {penalty.quizDone < penalty.quizRequired && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Task 2: Cloze Penalty */}
            <div className={`p-4 rounded-2xl border transition-all ${
              penalty.clozeDone >= penalty.clozeRequired
                ? 'bg-emerald-950/40 border-emerald-400/40 text-emerald-200'
                : 'bg-slate-800/80 border-rose-500/30 text-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Layers className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-black">
                    {lang === 'vi' ? 'Đục lỗ phạt' : 'Cloze Penalty'}
                  </span>
                </div>
                <span className="text-xs font-black text-rose-300">
                  {penalty.clozeDone}/{penalty.clozeRequired}
                </span>
              </div>

              <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden mb-3 border border-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    penalty.clozeDone >= penalty.clozeRequired
                      ? 'bg-emerald-400'
                      : 'bg-gradient-to-r from-rose-500 to-amber-500'
                  }`}
                  style={{ width: `${clozePercent}%` }}
                />
              </div>

              <button
                type="button"
                onClick={() => onNavigateToPractice('cloze')}
                disabled={penalty.clozeDone >= penalty.clozeRequired}
                className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  penalty.clozeDone >= penalty.clozeRequired
                    ? 'bg-emerald-500/20 text-emerald-300 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
                }`}
              >
                <span>
                  {penalty.clozeDone >= penalty.clozeRequired
                    ? (lang === 'vi' ? '✓ Đã xong' : '✓ Cleared')
                    : (lang === 'vi' ? 'Làm bài phạt Đục lỗ ngay' : 'Do Cloze Penalty')}
                </span>
                {penalty.clozeDone < penalty.clozeRequired && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Action / Resolution Footer */}
          {isAllResolved ? (
            <button
              type="button"
              onClick={handleUnlock}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-sm sm:text-base shadow-xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span>{lang === 'vi' ? 'Mở khóa ứng dụng & Tiếp tục học 🚀' : 'Unlock App & Continue 🚀'}</span>
            </button>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 italic">
                ⚡ {lang === 'vi'
                  ? 'Kỷ luật là cầu nối giữa mục tiêu và thành công. Mỗi câu hỏi làm đúng sẽ trừ trực tiếp vào nợ phạt.'
                  : 'Discipline bridges goals and success. Each completed answer reduces your penalty debt.'}
              </p>
              <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col gap-2.5">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center sm:text-left">
                  <span className="text-xs text-slate-300">
                    {lang === 'vi' ? 'Đã hoàn thành mục tiêu trên PC / máy khác?' : 'Completed goals on PC / another device?'}
                  </span>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleSyncCloud}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-400' : 'text-slate-400'}`} />
                      <span>{isSyncing ? (lang === 'vi' ? 'Đang kiểm tra...' : 'Checking...') : (lang === 'vi' ? 'Đồng bộ từ Cloud' : 'Sync Cloud')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDirectUnlock}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold text-white shadow-md shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Unlock className="w-3.5 h-3.5 text-emerald-200" />
                      <span>{lang === 'vi' ? 'Mở khóa ngay (Đã xong trên PC)' : 'Unlock Now (Done on PC)'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
