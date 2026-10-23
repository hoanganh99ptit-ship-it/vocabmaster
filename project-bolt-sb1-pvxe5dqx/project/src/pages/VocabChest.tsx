import { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Trash2,
  Pencil,
  FolderOpen,
  X,
  Check,
  ArrowRight,
  Folder,
  Loader2,
  Wand2,
  Sparkles,
  Layers,
  Clock,
  CheckCircle2,
  Link2,
  Volume2,
  Target,
  Flame,
  Gift,
  Trophy,
  HelpCircle,
  Film,
  RotateCw,
} from 'lucide-react';
import { RetroFilmRollModal } from '@/components/RetroFilmRollModal';
import { useAuth } from '@/context/AuthContext';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AudioControl } from '@/components/AudioControl';
import { DEFAULT_CHESTS, FALLBACK_CHEST_KEY } from '@/lib/categorizer';
import {
  batchAuditVocabWithGemini,
  normalizeSelectedVocabs,
  fetchCollocationsForWord,
  batchFetchCollocations,
  CHUNK_SIZE,
  type BatchAuditProgress,
} from '@/services/geminiService';
import { isDueForReview, getSRSStage } from '@/lib/srs';
import { speak } from '@/lib/speech';
import {
  getCollocationCache,
  saveCollocationsForWordToCache,
  getWeeklyGoal,
  getStreakData,
  getDaysLeftInWeek,
  DIFFICULTY_CONFIGS,
  type WeeklyGoal,
  type StreakData,
  type GoalDifficulty,
} from '@/lib/storage';
import { useTheme } from '@/context/ThemeContext';
import type { Vocabulary, CollocationItem, TabKey } from '@/lib/types';

interface VocabChestProps {
  onNavigate?: (tab: TabKey) => void;
}

export function VocabChest({ onNavigate }: VocabChestProps = {}) {
  const { user } = useAuth();
  const { vocabs, loading: vocabLoading, deleteVocabs, updateVocab, refresh, deduplicateVocabs } = useVocab();
  const { t, tFn, tFn2, lang } = useLanguage();
  const { show } = useToast();
  const { theme } = useTheme();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<Vocabulary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCategory, setMoveCategory] = useState('');
  const [deduplicating, setDeduplicating] = useState(false);
  const [filmRollOpen, setFilmRollOpen] = useState(false);

  // Batch audit & normalize state with strict progress tracking
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<BatchAuditProgress | null>(null);
  const [auditAbortController, setAuditAbortController] = useState<AbortController | null>(null);

  // Selected normalization state
  const [normalizingSelected, setNormalizingSelected] = useState(false);

  // Collocation & Phrasal Pairing state
  const [collocationMap, setCollocationMap] = useState<Record<string, CollocationItem[]>>(() => getCollocationCache());
  const [loadingCollocationIds, setLoadingCollocationIds] = useState<Set<string>>(new Set());
  const [batchCollocationLoading, setBatchCollocationLoading] = useState(false);
  const [collocationProgress, setCollocationProgress] = useState<{ done: number; total: number } | null>(null);
  const [collocationAbortController, setCollocationAbortController] = useState<AbortController | null>(null);

  // Weekly Goal & Streak tracking
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal>(() => getWeeklyGoal());
  const [streakData, setStreakData] = useState<StreakData>(() => getStreakData());
  const daysLeftInWeek = useMemo(() => getDaysLeftInWeek(), []);

  // Fallback safety timeout: if vocabLoading takes more than 3 seconds, stop showing the loader
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!vocabLoading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      setLoadTimedOut(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [vocabLoading]);

  useEffect(() => {
    const handleSync = () => {
      setWeeklyGoal(getWeeklyGoal());
      setStreakData(getStreakData());
    };
    window.addEventListener('vocabmaster_sync_completed', handleSync);
    return () => window.removeEventListener('vocabmaster_sync_completed', handleSync);
  }, []);

  // Build chest groups with counts
  const chestGroups = useMemo(() => {
    const map = new Map<string, Vocabulary[]>();
    vocabs.forEach((v) => {
      const cat = v.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(v);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [vocabs]);

  const categories = useMemo(() => chestGroups.map(([cat]) => cat), [chestGroups]);

  // SRS due count
  const srsDueCount = useMemo(() => {
    return vocabs.filter((v) => isDueForReview(v.dueDate)).length;
  }, [vocabs]);

  const filtered = useMemo(() => {
    return vocabs.filter((v) => {
      if (filterCategory === 'srs_due') {
        if (!isDueForReview(v.dueDate)) return false;
      } else if (filterCategory !== 'all' && v.category !== filterCategory) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          v.word.toLowerCase().includes(q) ||
          v.meaning.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [vocabs, search, filterCategory]);

  const allSelected = filtered.length > 0 && filtered.every((v) => selected.has(v.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((v) => v.id)));
    }
  };

  const handleDeleteSelected = async () => {
    setConfirmOpen(false);
    const ids = Array.from(selected);
    const { error } = await deleteVocabs(ids);
    if (error) {
      show(t('toastError'), 'error');
    } else {
      show(t('toastDeleted'), 'success');
      setSelected(new Set());
    }
  };

  const handleMoveSelected = async () => {
    if (!moveCategory.trim()) return;
    const ids = Array.from(selected);
    for (const id of ids) {
      await updateVocab(id, { category: moveCategory.trim() });
    }
    show(t('reclassified'), 'success');
    setSelected(new Set());
    setMoveOpen(false);
    setMoveCategory('');
  };

  const handleSaveEdit = async (updates: Partial<Vocabulary>) => {
    if (!editTarget) return;
    const { error } = await updateVocab(editTarget.id, updates);
    if (error) {
      show(t('toastError'), 'error');
    } else {
      show(t('toastUpdated'), 'success');
      setEditTarget(null);
    }
  };

  // ===== ROADMAP UPGRADE: DEDUPLICATE DATABASE WORDS =====
  const handleDeduplicate = async () => {
    setDeduplicating(true);
    try {
      const { error, removedCount } = await deduplicateVocabs();
      if (error) {
        show(`${t('toastError')}: ${error}`, 'error');
      } else if (removedCount > 0) {
        show(
          lang === 'vi'
            ? `Đã phát hiện và dọn dẹp ${removedCount} từ trùng lặp thành công!`
            : `Cleaned up ${removedCount} duplicate words successfully!`,
          'success'
        );
      } else {
        show(
          lang === 'vi'
            ? 'Không tìm thấy từ vựng nào bị trùng lặp.'
            : 'No duplicate vocabulary words found.',
          'success'
        );
      }
    } catch (err) {
      show(t('toastError'), 'error');
    } finally {
      setDeduplicating(false);
    }
  };

  const handleCancelAudit = () => {
    if (auditAbortController) {
      auditAbortController.abort();
    }
  };

  // ===== BATCH AUDIT VIA GEMINI (No Mocking, CHUNK_SIZE = 15, Strict Progress & Error Handling) =====
  const handleBatchAudit = async () => {
    let wordsToAudit: Array<{ id: string; word: string; meaning: string; type: string }>;
    if (selected.size > 0) {
      const selectedIds = Array.from(selected);
      wordsToAudit = vocabs
        .filter((v) => selectedIds.includes(v.id))
        .map((v) => ({ id: v.id, word: v.word, meaning: v.meaning, type: v.type }));
    } else {
      // Audit all currently filtered / chest words (e.g. all 738 words if on All)
      wordsToAudit = filtered.map((v) => ({ id: v.id, word: v.word, meaning: v.meaning, type: v.type }));
    }

    if (wordsToAudit.length === 0) {
      show(lang === 'vi' ? 'Không có từ vựng nào để kiểm tra.' : 'No vocabulary words to audit.', 'info');
      return;
    }

    const controller = new AbortController();
    setAuditAbortController(controller);
    setAuditing(true);
    setAuditProgress({
      scanned: 0,
      total: wordsToAudit.length,
      errorsFound: 0,
      currentChunk: 1,
      totalChunks: Math.ceil(wordsToAudit.length / CHUNK_SIZE),
    });

    try {
      const result = await batchAuditVocabWithGemini(
        wordsToAudit,
        (progress) => setAuditProgress(progress),
        controller.signal
      );

      if (result.items.length === 0) {
        show(t('aiBatchAuditNone'), 'success');
      } else {
        let fixedCount = 0;
        for (const item of result.items) {
          const { error } = await updateVocab(item.vocabId, {
            word: item.corrected.word,
            type: item.corrected.partOfSpeech,
            meaning: item.corrected.meaning,
          });
          if (!error) fixedCount++;
        }

        // Automatic clean duplicates after audit
        await deduplicateVocabs();
        await refresh();

        show(tFn('aiBatchAuditAutoApplied', fixedCount), 'success');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('Đã hủy')) {
        show(lang === 'vi' ? 'Đã dừng quá trình kiểm tra từ vựng.' : 'Vocabulary audit stopped.', 'info');
      } else {
        // Red Toast for API / network / parsing errors (No silent catch)
        show(`Lỗi kiểm tra AI: ${errMsg}`, 'error');
      }
    } finally {
      setAuditing(false);
      setAuditProgress(null);
      setAuditAbortController(null);
    }
  };

  // ===== NORMALIZE SELECTED VIA GEMINI (No Mocking) =====
  const handleNormalizeSelected = async () => {
    const selectedIds = Array.from(selected);
    if (selectedIds.length === 0) return;

    const selectedVocabs = vocabs.filter((v) => selectedIds.includes(v.id));
    const controller = new AbortController();
    setAuditAbortController(controller);
    setNormalizingSelected(true);
    setAuditProgress({
      scanned: 0,
      total: selectedVocabs.length,
      errorsFound: 0,
      currentChunk: 1,
      totalChunks: Math.ceil(selectedVocabs.length / CHUNK_SIZE),
    });

    try {
      const results = await normalizeSelectedVocabs(
        selectedVocabs.map((v) => ({ id: v.id, word: v.word, meaning: v.meaning, type: v.type })),
        (progress) => setAuditProgress(progress),
        controller.signal
      );

      let fixedCount = 0;
      const dupIds: string[] = [];

      for (const res of results) {
        if (res.isDuplicateOf) {
          dupIds.push(res.id);
        } else if (res.wasChanged) {
          const { error } = await updateVocab(res.id, {
            word: res.correctedWord,
            meaning: res.correctedMeaning,
            type: res.partOfSpeech,
          });
          if (!error) fixedCount++;
        }
      }

      if (dupIds.length > 0) {
        await deleteVocabs(dupIds);
      }

      await refresh();
      show(tFn('aiFixedAndSaved', fixedCount), 'success');
      setSelected(new Set());
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('Đã hủy')) {
        show(lang === 'vi' ? 'Đã dừng quá trình chuẩn hóa.' : 'Normalization stopped.', 'info');
      } else {
        show(`Lỗi chuẩn hóa AI: ${errMsg}`, 'error');
      }
    } finally {
      setNormalizingSelected(false);
      setAuditProgress(null);
      setAuditAbortController(null);
    }
  };

  // Collocation handlers
  const handleGenerateSingleCollocation = async (vocab: Vocabulary, forceRefresh = false) => {
    const wordKey = vocab.word.trim().toLowerCase();
    if (!forceRefresh && collocationMap[wordKey] && collocationMap[wordKey].length > 0) return;

    setLoadingCollocationIds((prev) => new Set(prev).add(vocab.id));
    try {
      const res = await fetchCollocationsForWord(vocab.word, vocab.meaning, vocab.type);
      if (res && res.length > 0) {
        setCollocationMap((prev) => ({ ...prev, [wordKey]: res }));
        show(
          lang === 'vi'
            ? `Đã tìm thấy 2 cụm từ cho "${vocab.word}"!`
            : `Found collocations for "${vocab.word}"!`,
          'success'
        );
      } else {
        show(
          lang === 'vi'
            ? `Không tìm được cụm từ cho "${vocab.word}". Kiểm tra kết nối AI.`
            : `Could not find collocations for "${vocab.word}". Check AI connection.`,
          'info'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      show(`Lỗi: ${msg}`, 'error');
    } finally {
      setLoadingCollocationIds((prev) => {
        const next = new Set(prev);
        next.delete(vocab.id);
        return next;
      });
    }
  };

  const handleBatchCollocations = async (targetWords?: Vocabulary[]) => {
    const list = targetWords || (selected.size > 0 ? vocabs.filter((v) => selected.has(v.id)) : filtered);
    if (list.length === 0) return;

    const controller = new AbortController();
    setCollocationAbortController(controller);
    setBatchCollocationLoading(true);
    setCollocationProgress({ done: 0, total: list.length });

    try {
      const res = await batchFetchCollocations(list, {
        signal: controller.signal,
        onProgress: (done, total) => {
          setCollocationProgress({ done, total });
        },
      });

      setCollocationMap((prev) => ({ ...prev, ...res }));
      const foundCount = Object.keys(res).length;
      show(
        lang === 'vi'
          ? `Hoàn tất! Đã có cụm từ cho ${foundCount} từ vựng.`
          : `Done! Collocations ready for ${foundCount} words.`,
        'success'
      );
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        show(lang === 'vi' ? 'Đã dừng tìm cụm từ.' : 'Collocation search cancelled.', 'info');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        show(`Lỗi: ${msg}`, 'error');
      }
    } finally {
      setBatchCollocationLoading(false);
      setCollocationProgress(null);
      setCollocationAbortController(null);
    }
  };

  const handleCancelCollocation = () => {
    if (collocationAbortController) {
      collocationAbortController.abort();
      setCollocationAbortController(null);
    }
  };

  const chestDisplayName = (cat: string): string => {
    const defaultChest = DEFAULT_CHESTS.find((c) => c.key === cat);
    if (defaultChest) return lang === 'vi' ? defaultChest.nameVi : defaultChest.nameEn;
    for (const c of DEFAULT_CHESTS) {
      if (cat === c.nameEn || cat === c.nameVi) return lang === 'vi' ? c.nameVi : c.nameEn;
    }
    if (cat === FALLBACK_CHEST_KEY || cat === 'General' || cat === 'Chung') {
      return lang === 'vi' ? 'Chung' : 'General';
    }
    return cat;
  };

  const chestColor = (cat: string): string => {
    const key = DEFAULT_CHESTS.find((c) => c.key === cat || c.nameEn === cat || c.nameVi === cat)?.key;
    switch (key) {
      case 'technology':
        return 'from-sky-400 to-blue-500';
      case 'business':
        return 'from-emerald-400 to-teal-500';
      case 'dailyLife':
        return 'from-amber-400 to-orange-500';
      case 'academic':
        return 'from-violet-400 to-purple-500';
      case 'communication':
        return 'from-rose-400 to-pink-500';
      default:
        return 'from-slate-400 to-slate-500';
    }
  };

  if (vocabLoading && vocabs.length === 0 && !loadTimedOut) {
    return (
      <div className={`max-w-4xl mx-auto text-center py-20 animate-fade-in ${theme === 'cinema' ? 'text-amber-100' : ''}`}>
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 shadow-sm ${
          theme === 'cinema' ? 'bg-amber-500/20 text-amber-400' : 'bg-sky-50 text-sky-500'
        }`}>
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <h3 className={`text-base font-bold ${theme === 'cinema' ? 'text-amber-100' : 'text-slate-700'}`}>
          {lang === 'vi' ? 'Đang đồng bộ và tải kho từ vựng...' : 'Loading vocabulary chest...'}
        </h3>
      </div>
    );
  }

  if (vocabs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20 animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <FolderOpen className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700">{t('noWords')}</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{t('noWordsDesc')}</p>
        {user && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={() => refresh()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 hover:border-sky-300 transition-all cursor-pointer shadow-xs"
            >
              <RotateCw className="w-4 h-4" />
              <span>{lang === 'vi' ? 'Đồng bộ & tải lại từ Cloud' : 'Sync & reload from Cloud'}</span>
            </button>
            <p className="text-xs text-slate-400">
              {lang === 'vi' ? `Tài khoản: ${user.email}` : `Account: ${user.email}`}
            </p>
          </div>
        )}
        {!user && (
          <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-200/80 max-w-md mx-auto text-amber-900 text-xs text-left shadow-xs">
            <span className="font-bold block mb-1">
              {lang === 'vi' ? '💡 Bạn đang ở chế độ khách (chưa đăng nhập):' : '💡 You are browsing as a guest:'}
            </span>
            <span>
              {lang === 'vi'
                ? 'Nếu bạn đã từng lưu từ vựng vào tài khoản trước đó, vui lòng bấm nút "Đăng nhập" ở góc trên bên phải để tải lại toàn bộ từ vựng của bạn.'
                : 'If you have saved vocabulary to an account previously, please click "Sign In" at the top right to restore all your words.'}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-sm ${
          theme === 'cinema'
            ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
            : 'bg-white border-slate-200'
        }`}>
          <span className={`text-xs sm:text-sm font-semibold ${theme === 'cinema' ? 'text-amber-300/80 font-mono' : 'text-slate-500'}`}>{t('totalWords')}</span>
          <span className={`text-base sm:text-lg font-bold ${theme === 'cinema' ? 'text-amber-300 font-mono' : 'text-sky-600'}`}>{vocabs.length}</span>
        </div>
        <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-sm ${
          theme === 'cinema'
            ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
            : 'bg-white border-slate-200'
        }`}>
          <span className={`text-xs sm:text-sm font-semibold ${theme === 'cinema' ? 'text-amber-300/80 font-mono' : 'text-slate-500'}`}>{t('categories')}</span>
          <span className={`text-base sm:text-lg font-bold ${theme === 'cinema' ? 'text-amber-400 font-mono' : 'text-teal-600'}`}>{chestGroups.length}</span>
        </div>
        <button
          onClick={() => setFilterCategory(filterCategory === 'srs_due' ? 'all' : 'srs_due')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all shadow-sm cursor-pointer ${
            filterCategory === 'srs_due'
              ? (theme === 'cinema'
                  ? 'bg-amber-500 text-stone-950 font-black border-amber-400 ring-2 ring-amber-500/40'
                  : 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-200')
              : (theme === 'cinema'
                  ? 'bg-[#18130e] border-amber-500/35 text-amber-200 hover:border-amber-400'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300')
          }`}
        >
          <Clock className={`w-4 h-4 ${theme === 'cinema' ? 'text-amber-400' : 'text-amber-500'}`} />
          <span className="text-xs sm:text-sm font-semibold">
            {lang === 'vi' ? 'Cần ôn tập hôm nay (SRS)' : 'Due for Review (SRS)'}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
            filterCategory === 'srs_due'
              ? (theme === 'cinema' ? 'bg-stone-950 text-amber-300' : 'bg-amber-700 text-white')
              : (theme === 'cinema' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-amber-100 text-amber-800')
          }`}>
            {srsDueCount}
          </span>
        </button>

        {/* 35mm Retro Film Roll Vlog View Button */}
        <button
          onClick={() => setFilmRollOpen(true)}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all shadow-sm font-mono text-xs font-bold cursor-pointer hover:scale-[1.02] ml-auto ${
            theme === 'cinema'
              ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 text-stone-950 font-black border-amber-400 shadow-amber-950/40'
              : 'bg-gradient-to-r from-stone-900 via-neutral-900 to-amber-950 text-amber-300 border-amber-500/40 hover:border-amber-400'
          }`}
          title="Xem từ vựng dưới dạng Cuộn phim 35mm Retro Vlog (Reels)"
        >
          <Film className={`w-4 h-4 ${theme === 'cinema' ? 'text-stone-950' : 'text-amber-400'}`} />
          <span>🎬 Cuộn phim Vlog (35mm)</span>
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="REC Active" />
        </button>
      </div>

      {/* Weekly Goal & Streak interactive banner */}
      {(() => {
        const quizPercent = Math.min(100, Math.round((weeklyGoal.quizReviewed / Math.max(1, weeklyGoal.quizTarget)) * 100));
        const clozePercent = Math.min(100, Math.round((weeklyGoal.clozeReviewed / Math.max(1, weeklyGoal.clozeTarget)) * 100));
        const isWeeklyAchieved = weeklyGoal.quizReviewed >= weeklyGoal.quizTarget && weeklyGoal.clozeReviewed >= weeklyGoal.clozeTarget;

        return (
          <div className={`mb-6 rounded-2xl border p-4 sm:p-5 shadow-xs transition-colors ${
            theme === 'cinema'
              ? 'bg-[#18130e] border-amber-500/40 text-amber-100 shadow-lg shadow-black/40'
              : 'bg-gradient-to-r from-sky-50 via-indigo-50/50 to-amber-50/40 border-indigo-100/80'
          }`}>
            {/* Top bar: Title + Week Key + Days left + Streak */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
              theme === 'cinema' ? 'border-amber-500/20' : 'border-indigo-100/60'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs flex-shrink-0 ${
                  theme === 'cinema'
                    ? 'bg-gradient-to-br from-amber-500 to-yellow-600 text-stone-950 font-black'
                    : 'bg-gradient-to-tr from-sky-500 to-indigo-600 text-white'
                }`}>
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`font-bold text-sm sm:text-base ${
                      theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'
                    }`}>
                      {lang === 'vi' ? 'Mục tiêu ôn tập tuần' : 'Weekly Review Goals'}
                    </h4>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      theme === 'cinema'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono'
                        : 'bg-indigo-100/80 text-indigo-700'
                    }`}>
                      {weeklyGoal.weekKey}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      theme === 'cinema'
                        ? 'bg-amber-500/20 text-amber-200 border-amber-500/40 font-mono'
                        : 'bg-sky-100 text-sky-800 border-sky-200'
                    }`}>
                      {lang === 'vi'
                        ? `Mức: ${(DIFFICULTY_CONFIGS[(weeklyGoal.difficulty as GoalDifficulty) || 'medium'] || DIFFICULTY_CONFIGS.medium).nameVi}`
                        : `Level: ${(DIFFICULTY_CONFIGS[(weeklyGoal.difficulty as GoalDifficulty) || 'medium'] || DIFFICULTY_CONFIGS.medium).nameEn}`}
                    </span>
                    <span className={`text-xs font-medium ${
                      theme === 'cinema' ? 'text-amber-400/80 font-mono' : 'text-slate-500'
                    }`}>
                      {lang === 'vi' ? `• Còn ${daysLeftInWeek} ngày` : `• ${daysLeftInWeek} days left`}
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${
                    theme === 'cinema' ? 'text-amber-200/70' : 'text-slate-500'
                  }`}>
                    {isWeeklyAchieved
                      ? (lang === 'vi' ? '🎉 Đã hoàn thành toàn bộ chỉ tiêu tuần! Xuất sắc!' : '🎉 All weekly targets achieved!')
                      : (lang === 'vi' ? 'Hoàn thành 2 kỹ năng trọng tâm dưới đây để mở khóa phần thưởng:' : 'Complete both key skill targets to unlock your reward:')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shadow-2xs ${
                  theme === 'cinema'
                    ? 'bg-[#120e0b] border-amber-500/40 text-amber-300'
                    : 'bg-white border-amber-200/80 text-orange-800'
                }`}>
                  <Flame className={`w-4 h-4 ${theme === 'cinema' ? 'text-amber-400 fill-amber-400' : 'text-orange-500 fill-orange-500'}`} />
                  <span className={`text-xs font-bold ${theme === 'cinema' ? 'text-amber-300' : 'text-orange-800'}`}>
                    {streakData.currentStreak} {lang === 'vi' ? 'ngày liên tiếp' : 'days streak'}
                  </span>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('analytics')}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1 border ${
                      theme === 'cinema'
                        ? 'text-amber-300 hover:text-amber-100 bg-[#120e0b] hover:bg-[#221a14] border-amber-500/40'
                        : 'text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50/80 border-indigo-200/70'
                    }`}
                    title={lang === 'vi' ? 'Xem phân tích & sửa cam kết thưởng phạt' : 'View analytics & edit contract'}
                  >
                    <span>{lang === 'vi' ? 'Khế ước & Chi tiết' : 'Contract & Goals'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* 2 Focused Feature Goal Trackers: Quiz & Cloze */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3.5">
              {/* 1. Luyện trắc nghiệm (Quiz) */}
              <div className={`rounded-xl p-3 border shadow-2xs transition-all ${
                theme === 'cinema'
                  ? 'bg-[#120e0b] border-amber-500/30 text-amber-100 hover:border-amber-500/60'
                  : 'bg-white/90 border-sky-100/90 hover:border-sky-300'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${theme === 'cinema' ? 'bg-amber-400' : 'bg-sky-500'}`} />
                    <span className={`text-xs font-bold ${theme === 'cinema' ? 'text-amber-200' : 'text-slate-700'}`}>
                      {lang === 'vi' ? 'Luyện trắc nghiệm (Quiz)' : 'Multiple Choice Quiz'}
                    </span>
                  </div>
                  <span className={`text-xs font-black ${theme === 'cinema' ? 'text-amber-300 font-mono' : 'text-sky-600'}`}>
                    {weeklyGoal.quizReviewed}/{weeklyGoal.quizTarget} {lang === 'vi' ? 'từ' : 'words'} ({quizPercent}%)
                  </span>
                </div>
                <div className={`w-full rounded-full h-2 overflow-hidden mb-2 ${
                  theme === 'cinema' ? 'bg-stone-900 border border-amber-500/20' : 'bg-slate-100'
                }`}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      weeklyGoal.quizReviewed >= weeklyGoal.quizTarget
                        ? (theme === 'cinema' ? 'bg-emerald-400' : 'bg-emerald-500')
                        : (theme === 'cinema' ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-sky-400 to-indigo-500')
                    }`}
                    style={{ width: `${quizPercent}%` }}
                  />
                </div>
                <div className={`flex items-center justify-between text-[11px] ${
                  theme === 'cinema' ? 'text-amber-300/80 font-mono' : 'text-slate-500'
                }`}>
                  <span>
                    {weeklyGoal.quizReviewed >= weeklyGoal.quizTarget
                      ? (lang === 'vi' ? '✓ Đã đạt chỉ tiêu' : '✓ Target achieved')
                      : (lang === 'vi' ? `Còn ${Math.max(0, weeklyGoal.quizTarget - weeklyGoal.quizReviewed)} từ` : `${Math.max(0, weeklyGoal.quizTarget - weeklyGoal.quizReviewed)} remaining`)}
                  </span>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('quiz')}
                      className={`font-bold transition-colors cursor-pointer ${
                        theme === 'cinema' ? 'text-amber-400 hover:text-amber-200' : 'text-sky-600 hover:text-sky-800'
                      }`}
                    >
                      {lang === 'vi' ? 'Luyện ngay →' : 'Practice now →'}
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Đục lỗ ngữ cảnh (Cloze Test) */}
              <div className={`rounded-xl p-3 border shadow-2xs transition-all ${
                theme === 'cinema'
                  ? 'bg-[#120e0b] border-amber-500/30 text-amber-100 hover:border-amber-500/60'
                  : 'bg-white/90 border-emerald-100/90 hover:border-emerald-300'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${theme === 'cinema' ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
                    <span className={`text-xs font-bold ${theme === 'cinema' ? 'text-amber-200' : 'text-slate-700'}`}>
                      {lang === 'vi' ? 'Đục lỗ ngữ cảnh (Cloze)' : 'Context Cloze Test'}
                    </span>
                  </div>
                  <span className={`text-xs font-black ${theme === 'cinema' ? 'text-emerald-400 font-mono' : 'text-emerald-600'}`}>
                    {weeklyGoal.clozeReviewed}/{weeklyGoal.clozeTarget} {lang === 'vi' ? 'câu' : 'sentences'} ({clozePercent}%)
                  </span>
                </div>
                <div className={`w-full rounded-full h-2 overflow-hidden mb-2 ${
                  theme === 'cinema' ? 'bg-stone-900 border border-amber-500/20' : 'bg-slate-100'
                }`}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      weeklyGoal.clozeReviewed >= weeklyGoal.clozeTarget
                        ? (theme === 'cinema' ? 'bg-emerald-400' : 'bg-emerald-500')
                        : (theme === 'cinema' ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-emerald-400 to-teal-500')
                    }`}
                    style={{ width: `${clozePercent}%` }}
                  />
                </div>
                <div className={`flex items-center justify-between text-[11px] ${
                  theme === 'cinema' ? 'text-amber-300/80 font-mono' : 'text-slate-500'
                }`}>
                  <span>
                    {weeklyGoal.clozeReviewed >= weeklyGoal.clozeTarget
                      ? (lang === 'vi' ? '✓ Đã đạt chỉ tiêu' : '✓ Target achieved')
                      : (lang === 'vi' ? `Còn ${Math.max(0, weeklyGoal.clozeTarget - weeklyGoal.clozeReviewed)} câu` : `${Math.max(0, weeklyGoal.clozeTarget - weeklyGoal.clozeReviewed)} remaining`)}
                  </span>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('cloze')}
                      className={`font-bold transition-colors cursor-pointer ${
                        theme === 'cinema' ? 'text-emerald-400 hover:text-emerald-200' : 'text-emerald-600 hover:text-emerald-800'
                      }`}
                    >
                      {lang === 'vi' ? 'Luyện ngay →' : 'Practice now →'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Commitment Contract Bar (Thưởng & Phạt) */}
            <div className={`mt-3 pt-2.5 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs rounded-xl px-3 py-2 ${
              theme === 'cinema'
                ? isWeeklyAchieved
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : 'bg-[#120e0b] text-amber-200 border border-amber-500/25'
                : isWeeklyAchieved
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-white/70 text-slate-700 border-indigo-100/60'
            }`}>
              {isWeeklyAchieved ? (
                <div className="flex items-center gap-2 font-bold text-emerald-400">
                  <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>{lang === 'vi' ? `🎉 ĐÃ MỞ KHÓA PHẦN THƯỞNG: ${weeklyGoal.rewardText}` : `🎉 REWARD UNLOCKED: ${weeklyGoal.rewardText}`}</span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 w-full justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <Gift className={`w-3.5 h-3.5 flex-shrink-0 ${theme === 'cinema' ? 'text-amber-400' : 'text-pink-500'}`} />
                    <span className={`font-semibold flex-shrink-0 ${theme === 'cinema' ? 'text-amber-400/80' : 'text-slate-500'}`}>{lang === 'vi' ? 'Thưởng:' : 'Reward:'}</span>
                    <span className={`font-bold truncate ${theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'}`}>{weeklyGoal.rewardText}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-amber-400 font-bold flex-shrink-0">⚡</span>
                    <span className={`font-semibold flex-shrink-0 ${theme === 'cinema' ? 'text-amber-400/80' : 'text-slate-500'}`}>{lang === 'vi' ? 'Phạt:' : 'Penalty:'}</span>
                    <span className={`font-medium truncate ${theme === 'cinema' ? 'text-amber-300' : 'text-amber-800'}`}>{weeklyGoal.penaltyText}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Chest folder cards */}
      {filterCategory === 'all' && !search.trim() && (
        <div className="mb-8">
          <h3 className={`text-sm font-bold uppercase tracking-wider mb-3 ${
            theme === 'cinema' ? 'text-amber-400 font-mono' : 'text-slate-500'
          }`}>{t('categories')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {chestGroups.map(([cat, words]) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`group rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all text-left ${
                  theme === 'cinema'
                    ? 'bg-[#18130e] border-amber-500/35 hover:border-amber-400 text-amber-100 shadow-black/40'
                    : theme === 'retro'
                    ? 'bg-[#fffdfa] border-[#ebdccb] hover:border-amber-400 text-stone-900'
                    : 'bg-white border-slate-200 hover:border-sky-300 text-slate-800'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${chestColor(
                    cat
                  )} flex items-center justify-center mb-3 shadow-sm`}
                >
                  <Folder className="w-5 h-5 text-white" />
                </div>
                <p className={`font-bold text-sm truncate ${
                  theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'
                }`}>{chestDisplayName(cat)}</p>
                <p className={`text-xs mt-0.5 ${
                  theme === 'cinema' ? 'text-amber-400/80 font-mono' : 'text-slate-400'
                }`}>{tFn('wordsCount', words.length)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky / Prominent AI Progress Bar Banner */}
      {(auditing || normalizingSelected) && auditProgress && (
        <div className={`mb-5 p-4 sm:p-5 rounded-2xl border shadow-md animate-slide-up ${
          theme === 'cinema'
            ? 'bg-[#18130e]/95 border-amber-500/40 text-amber-100 shadow-2xl shadow-amber-950/40'
            : 'bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-amber-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0 ${
                theme === 'cinema' ? 'bg-amber-600 text-stone-950' : 'bg-amber-500 text-white'
              }`}>
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h4 className={`font-bold text-sm sm:text-base flex items-center gap-2 ${
                  theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
                }`}>
                  <span>
                    {auditing
                      ? (lang === 'vi' ? 'Đang dọn dẹp lỗi chính tả với AI...' : 'Cleaning spelling errors with AI...')
                      : (lang === 'vi' ? 'Đang chuẩn hóa các từ đã chọn...' : 'Normalizing selected vocabulary...')}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    theme === 'cinema' ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'bg-amber-200 text-amber-900'
                  }`}>
                    {Math.round((auditProgress.scanned / Math.max(1, auditProgress.total)) * 100)}%
                  </span>
                </h4>
                <p className={`text-xs sm:text-sm mt-0.5 ${
                  theme === 'cinema' ? 'text-amber-200/80' : 'text-slate-600'
                }`}>
                  {lang === 'vi'
                    ? `Đang kiểm tra từ ${auditProgress.scanned} / ${auditProgress.total}... (Cụm ${auditProgress.currentChunk}/${auditProgress.totalChunks} • ${CHUNK_SIZE} từ/lượt)`
                    : `Checking word ${auditProgress.scanned} / ${auditProgress.total}... (Chunk ${auditProgress.currentChunk}/${auditProgress.totalChunks} • ${CHUNK_SIZE} words/batch)`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center">
              {auditProgress.errorsFound > 0 && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  theme === 'cinema' ? 'text-rose-300 bg-rose-950/60 border border-rose-500/40' : 'text-rose-600 bg-rose-50 border border-rose-200'
                }`}>
                  {lang === 'vi' ? `Đã phát hiện: ${auditProgress.errorsFound} lỗi` : `Found: ${auditProgress.errorsFound} issues`}
                </span>
              )}
              {auditAbortController && (
                <button
                  type="button"
                  onClick={handleCancelAudit}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shadow-sm ${
                    theme === 'cinema'
                      ? 'bg-stone-900 border-amber-500/40 text-amber-200 hover:bg-stone-800 hover:text-white'
                      : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {lang === 'vi' ? 'Dừng lại' : 'Stop'}
                </button>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className={`w-full rounded-full h-3 overflow-hidden shadow-inner p-0.5 ${
            theme === 'cinema' ? 'bg-stone-900/90 border border-amber-500/30' : 'bg-amber-200/60'
          }`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out shadow-sm ${
                theme === 'cinema'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500'
              }`}
              style={{
                width: `${Math.min(100, Math.max(3, Math.round((auditProgress.scanned / Math.max(1, auditProgress.total)) * 100)))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Prominent AI Collocation Progress Banner */}
      {batchCollocationLoading && collocationProgress && (
        <div className={`mb-5 p-4 sm:p-5 rounded-2xl border shadow-md animate-slide-up ${
          theme === 'cinema'
            ? 'bg-[#18130e]/95 border-amber-500/40 text-amber-100 shadow-2xl shadow-amber-950/40'
            : 'bg-gradient-to-r from-sky-50 via-indigo-50 to-sky-50 border-sky-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0 ${
                theme === 'cinema' ? 'bg-amber-600 text-stone-950' : 'bg-indigo-600 text-white'
              }`}>
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h4 className={`font-bold text-sm sm:text-base flex items-center gap-2 ${
                  theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'
                }`}>
                  <span>
                    {lang === 'vi'
                      ? 'AI đang tìm cụm từ cố định (Collocations & Phrasal Pairing)...'
                      : 'AI is finding natural collocations & phrasal pairings...'}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    theme === 'cinema' ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'bg-indigo-200 text-indigo-900'
                  }`}>
                    {Math.round((collocationProgress.done / Math.max(1, collocationProgress.total)) * 100)}%
                  </span>
                </h4>
                <p className={`text-xs sm:text-sm mt-0.5 ${
                  theme === 'cinema' ? 'text-amber-200/80' : 'text-slate-600'
                }`}>
                  {lang === 'vi'
                    ? `Đang tìm cụm từ cho từ ${collocationProgress.done} / ${collocationProgress.total}...`
                    : `Finding collocations for word ${collocationProgress.done} / ${collocationProgress.total}...`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center">
              {collocationAbortController && (
                <button
                  type="button"
                  onClick={handleCancelCollocation}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors shadow-sm ${
                    theme === 'cinema'
                      ? 'bg-stone-900 border-amber-500/40 text-amber-200 hover:bg-stone-800 hover:text-white'
                      : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {lang === 'vi' ? 'Dừng lại' : 'Stop'}
                </button>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className={`w-full rounded-full h-3 overflow-hidden shadow-inner p-0.5 ${
            theme === 'cinema' ? 'bg-stone-900/90 border border-amber-500/30' : 'bg-indigo-200/60'
          }`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out shadow-sm ${
                theme === 'cinema'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300'
                  : 'bg-gradient-to-r from-sky-500 to-indigo-600'
              }`}
              style={{
                width: `${Math.min(100, Math.max(3, Math.round((collocationProgress.done / Math.max(1, collocationProgress.total)) * 100)))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Search, Deduplicate, AI Audit, Collocations & Filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${theme === 'cinema' ? 'text-amber-400/70' : 'text-slate-400'}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-11 pr-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
              theme === 'cinema'
                ? 'border-amber-500/40 bg-[#1a140f] text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                : 'border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:ring-sky-400'
            }`}
            placeholder={t('searchWords')}
          />
        </div>

        {/* Clean Duplicates Button */}
        <button
          onClick={handleDeduplicate}
          disabled={deduplicating || vocabs.length === 0}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-50 whitespace-nowrap cursor-pointer ${
            theme === 'cinema'
              ? 'bg-[#1e1711] border border-amber-500/40 text-amber-200 hover:bg-[#281f17] hover:border-amber-400 hover:text-amber-100 shadow-md shadow-amber-950/30'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
          }`}
          title={lang === 'vi' ? 'Quét và dọn dẹp các từ vựng trùng lặp' : 'Scan and clean duplicate vocabulary'}
        >
          {deduplicating ? (
            <Loader2 className={`w-4 h-4 animate-spin ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-500'}`} />
          ) : (
            <Layers className={`w-4 h-4 ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-500'}`} />
          )}
          <span>{lang === 'vi' ? 'Dọn dẹp từ trùng' : 'Clean Duplicates'}</span>
        </button>

        {/* AI Batch Audit */}
        <button
          onClick={handleBatchAudit}
          disabled={auditing || vocabs.length === 0}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-50 whitespace-nowrap cursor-pointer ${
            theme === 'cinema'
              ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-stone-950 font-bold border border-amber-400/50 shadow-md shadow-amber-950/40 hover:scale-[1.01] active:scale-[0.99]'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-sm hover:scale-[1.01] active:scale-[0.99]'
          }`}
          title={lang === 'vi' ? 'Quét chính tả và chuẩn hóa từ vựng với Gemini AI' : 'Scan and fix spelling with Gemini AI'}
        >
          {auditing ? (
            <>
              <Loader2 className={`w-4 h-4 animate-spin ${theme === 'cinema' ? 'text-stone-950' : 'text-white'}`} />
              <span>{lang === 'vi' ? 'Đang dọn dẹp...' : 'Auditing...'}</span>
            </>
          ) : (
            <>
              <Wand2 className={`w-4 h-4 ${theme === 'cinema' ? 'text-stone-950' : 'text-white'}`} />
              <span>{t('aiCleanupSpellErrors')}</span>
            </>
          )}
        </button>

        {/* AI Batch Collocations */}
        <button
          onClick={() => handleBatchCollocations()}
          disabled={batchCollocationLoading || auditing || vocabs.length === 0}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-50 whitespace-nowrap cursor-pointer ${
            theme === 'cinema'
              ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-bold border border-amber-400/50 shadow-md shadow-amber-950/40 hover:scale-[1.01] active:scale-[0.99]'
              : 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 shadow-sm hover:scale-[1.01] active:scale-[0.99]'
          }`}
          title={lang === 'vi' ? 'AI tự động bổ sung 2 cụm từ thường đi kèm nhất (Collocations & Phrasal Pairing)' : 'AI find common collocations'}
        >
          {batchCollocationLoading ? (
            <>
              <Loader2 className={`w-4 h-4 animate-spin ${theme === 'cinema' ? 'text-stone-950' : 'text-white'}`} />
              <span>{lang === 'vi' ? 'Đang tìm...' : 'Loading...'}</span>
            </>
          ) : (
            <>
              <Link2 className={`w-4 h-4 ${theme === 'cinema' ? 'text-stone-950' : 'text-white'}`} />
              <span>{lang === 'vi' ? 'Tìm cụm từ (Collocations)' : 'Find Collocations'}</span>
            </>
          )}
        </button>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className={`px-4 py-2.5 rounded-xl border font-medium focus:outline-none focus:ring-2 cursor-pointer transition-all ${
            theme === 'cinema'
              ? 'bg-[#1a1410] border-amber-500/30 text-amber-200 focus:ring-amber-400'
              : 'bg-white border-slate-200 text-slate-700 focus:ring-sky-400'
          }`}
        >
          <option value="all">{t('allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Select all & Count */}
      <div className="flex items-center justify-between mb-4">
        <label className={`flex items-center gap-2 text-sm font-semibold cursor-pointer ${
          theme === 'cinema' ? 'text-amber-200' : 'text-slate-600'
        }`}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
          />
          {t('selectAll')}
        </label>
        <span className={`text-sm ${
          theme === 'cinema' ? 'text-amber-400/80 font-mono' : 'text-slate-400'
        }`}>
          {filtered.length} / {vocabs.length}
        </span>
      </div>

      {/* Word cards with Spaced Repetition (SRS) Status Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((vocab) => {
          const srsStage = getSRSStage(vocab.interval, vocab.repetition);
          const isDue = isDueForReview(vocab.dueDate);
          const wordKey = vocab.word.trim().toLowerCase();
          const collocations = collocationMap[wordKey] || vocab.collocations;

          return (
            <div
              key={vocab.id}
              className={`group rounded-2xl border p-4 sm:p-5 shadow-sm transition-all hover:shadow-md ${
                theme === 'cinema'
                  ? `bg-[#18130e] text-amber-100 shadow-black/50 ${
                      selected.has(vocab.id)
                        ? 'border-amber-400 ring-2 ring-amber-500/40'
                        : 'border-amber-500/30 hover:border-amber-500/60'
                    }`
                  : theme === 'retro'
                  ? `bg-[#fffdfa] text-stone-900 ${
                      selected.has(vocab.id)
                        ? 'border-amber-500 ring-2 ring-amber-200'
                        : 'border-[#ebdccb] hover:border-amber-300'
                    }`
                  : `bg-white text-slate-800 ${
                      selected.has(vocab.id)
                        ? 'border-sky-400 ring-2 ring-sky-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(vocab.id)}
                    onChange={() => toggleSelect(vocab.id)}
                    className="w-4 h-4 mt-1 rounded border-slate-300 text-amber-500 focus:ring-amber-400 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-bold text-lg truncate ${
                        theme === 'cinema' ? 'text-amber-100 font-serif' : theme === 'retro' ? 'text-stone-900 font-serif' : 'text-slate-800'
                      }`}>
                        {vocab.word}
                      </h3>
                      {vocab.type && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          theme === 'cinema'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 font-mono'
                            : 'text-sky-600 bg-sky-50'
                        }`}>
                          {vocab.type}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mt-1 leading-snug ${
                      theme === 'cinema' ? 'text-amber-200/90 font-medium' : 'text-slate-600'
                    }`}>
                      {vocab.meaning}
                    </p>

                    {/* Metadata & SRS badges */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span
                        className={`text-[11px] font-semibold text-white bg-gradient-to-r ${chestColor(
                          vocab.category
                        )} px-2.5 py-0.5 rounded-full shadow-2xs`}
                      >
                        {chestDisplayName(vocab.category)}
                      </span>

                      {/* SRS Stage indicator */}
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          theme === 'cinema'
                            ? 'bg-[#120e0b] border-amber-500/30 text-amber-300/90 font-mono'
                            : isDue
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}
                        title={
                          isDue
                            ? lang === 'vi'
                              ? 'Từ này đã đến hạn cần ôn lại!'
                              : 'Due for review now!'
                            : lang === 'vi'
                            ? `Giai đoạn: ${srsStage}`
                            : `Stage: ${srsStage}`
                        }
                      >
                        {isDue && <Clock className="w-3 h-3 text-amber-500 animate-pulse flex-shrink-0" />}
                        <span>{srsStage}</span>
                      </span>

                      {vocab.error_count > 0 && (
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          theme === 'cinema'
                            ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                            : 'text-rose-500 bg-rose-50 border-rose-100'
                        }`}>
                          {vocab.error_count} {t('errorCount').toLowerCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setEditTarget(vocab)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    theme === 'cinema'
                      ? 'text-amber-400/60 hover:text-amber-200 hover:bg-stone-900'
                      : 'text-slate-300 hover:text-sky-500'
                  }`}
                  title={t('editWord')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>

              {/* Collocations (Cụm từ cố định) */}
              <div className={`mt-3 pt-2.5 border-t ${theme === 'cinema' ? 'border-amber-500/20' : 'border-slate-100'}`}>
                {collocations && collocations.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        theme === 'cinema' ? 'text-amber-400/90 font-mono' : 'text-slate-500'
                      }`}>
                        <Link2 className={`w-3 h-3 ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-500'}`} />
                        {lang === 'vi' ? 'Cụm từ hay gặp' : 'Collocations'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateSingleCollocation(vocab, true);
                        }}
                        disabled={loadingCollocationIds.has(vocab.id)}
                        className={`text-[10px] flex items-center gap-0.5 transition-colors cursor-pointer ${
                          theme === 'cinema'
                            ? 'text-amber-400/70 hover:text-amber-200'
                            : 'text-slate-400 hover:text-sky-600'
                        }`}
                        title={lang === 'vi' ? 'Làm mới cụm từ với AI' : 'Refresh collocations'}
                      >
                        {loadingCollocationIds.has(vocab.id) ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-500" />
                        ) : (
                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                        )}
                        <span>{lang === 'vi' ? 'Đổi khác' : 'Refresh'}</span>
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {collocations.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            speak(item.phrase);
                          }}
                          title={lang === 'vi' ? `Nhấn để nghe phát âm: "${item.phrase}"` : `Click to listen: "${item.phrase}"`}
                          className={`group/item flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border transition-all text-left cursor-pointer ${
                            theme === 'cinema'
                              ? 'bg-[#120e0b] border-amber-500/30 hover:border-amber-400 hover:bg-[#201812]'
                              : 'bg-sky-50/60 hover:bg-sky-100/70 border-sky-100 hover:border-sky-300'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className={`text-xs font-bold block truncate ${
                              theme === 'cinema'
                                ? 'text-amber-200 group-hover/item:text-amber-100'
                                : 'text-sky-900 group-hover/item:text-sky-700'
                            }`}>
                              {item.phrase}
                            </span>
                            {item.meaning && (
                              <span className={`text-[11px] block truncate ${
                                theme === 'cinema'
                                  ? 'text-amber-300/70'
                                  : 'text-slate-500'
                              }`}>
                                {item.meaning}
                              </span>
                            )}
                          </div>
                          <Volume2 className={`w-3.5 h-3.5 flex-shrink-0 ${
                            theme === 'cinema' ? 'text-amber-400 opacity-80 group-hover/item:opacity-100' : 'text-sky-500 opacity-70 group-hover/item:opacity-100'
                          }`} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateSingleCollocation(vocab);
                      }}
                      disabled={loadingCollocationIds.has(vocab.id)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        theme === 'cinema'
                          ? 'bg-[#120e0b] text-amber-300 border-amber-500/30 hover:border-amber-400 hover:bg-[#201812]'
                          : 'text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 border-sky-200/60'
                      }`}
                      title={lang === 'vi' ? 'AI tìm 2 cụm từ thường đi kèm nhất' : 'AI find 2 most common collocations'}
                    >
                      {loadingCollocationIds.has(vocab.id) ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                          <span>{lang === 'vi' ? 'Đang tìm cụm từ...' : 'Finding collocations...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>{lang === 'vi' ? '✨ Tìm cụm từ đi kèm' : '✨ Find collocations'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className={`flex items-center justify-between pt-3 border-t mt-2 ${
                theme === 'cinema' ? 'border-amber-500/20' : 'border-slate-100'
              }`}>
                <AudioControl text={vocab.word} size="sm" showSpeed={false} />
                <button
                  onClick={() => {
                    setSelected(new Set([vocab.id]));
                    setConfirmOpen(true);
                  }}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    theme === 'cinema'
                      ? 'text-amber-400/50 hover:text-rose-400 hover:bg-rose-500/10'
                      : 'text-slate-300 hover:text-rose-500'
                  }`}
                  title={t('deleteWord')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating action bar for selected items (Mobile & Dark Mode optimized) */}
      {selected.size > 0 && (
        <div className={`fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] flex items-center gap-1.5 sm:gap-3 px-3 sm:px-5 py-2 sm:py-3 rounded-2xl shadow-2xl animate-slide-up overflow-x-auto no-scrollbar ${
          theme === 'cinema'
            ? 'bg-[#18130e]/95 text-amber-100 border border-amber-500/40 backdrop-blur-md shadow-black/80 ring-1 ring-amber-500/30'
            : 'bg-slate-800 text-white'
        }`}>
          <span className={`text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap ${
            theme === 'cinema' ? 'text-amber-300' : 'text-white'
          }`}>
            <span className={`w-2 h-2 rounded-full ${theme === 'cinema' ? 'bg-amber-400 animate-pulse' : 'bg-sky-400'}`} />
            {lang === 'vi' ? `Đã chọn ${selected.size}` : `Selected ${selected.size}`}
          </span>
          <div className={`w-px h-4 sm:h-5 ${theme === 'cinema' ? 'bg-amber-500/30' : 'bg-slate-600'}`} />
          <button
            onClick={handleNormalizeSelected}
            disabled={normalizingSelected}
            className={`flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              theme === 'cinema' ? 'text-amber-300 hover:text-amber-100' : 'text-amber-300 hover:text-amber-200'
            }`}
          >
            {normalizingSelected ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{tFn('aiFixSelectedCount', selected.size)}</span>
          </button>
          <div className={`w-px h-4 sm:h-5 ${theme === 'cinema' ? 'bg-amber-500/30' : 'bg-slate-600'}`} />
          <button
            onClick={() => handleBatchCollocations(vocabs.filter((v) => selected.has(v.id)))}
            disabled={batchCollocationLoading}
            className={`flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              theme === 'cinema' ? 'text-amber-200 hover:text-yellow-200' : 'text-indigo-300 hover:text-indigo-200'
            }`}
          >
            {batchCollocationLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            <span>{lang === 'vi' ? `Cụm từ (${selected.size})` : `Collocations (${selected.size})`}</span>
          </button>
          <div className={`w-px h-4 sm:h-5 ${theme === 'cinema' ? 'bg-amber-500/30' : 'bg-slate-600'}`} />
          <button
            onClick={() => setMoveOpen(true)}
            className={`flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              theme === 'cinema' ? 'text-amber-300 hover:text-amber-100' : 'text-sky-300 hover:text-sky-200'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            <span>{t('moveSelected')}</span>
          </button>
          <div className={`w-px h-4 sm:h-5 ${theme === 'cinema' ? 'bg-amber-500/30' : 'bg-slate-600'}`} />
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-rose-400 hover:text-rose-300 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t('deleteSelected')}</span>
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className={`ml-1 transition-colors cursor-pointer ${
              theme === 'cinema' ? 'text-stone-400 hover:text-amber-200' : 'text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className={`rounded-2xl border p-6 shadow-2xl max-w-md w-full ${
            theme === 'cinema'
              ? 'bg-[#1a140f] border-amber-500/40 text-amber-100'
              : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h3 className={`text-lg font-bold mb-4 ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'}`}>
              {t('editWord')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className={`text-xs font-semibold mb-1 block ${theme === 'cinema' ? 'text-amber-300/80' : 'text-slate-500'}`}>
                  {t('word')}
                </label>
                <input
                  value={editTarget.word}
                  onChange={(e) => setEditTarget({ ...editTarget, word: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'bg-stone-900 border border-amber-500/40 text-amber-100 focus:ring-amber-400'
                      : 'border border-slate-200 text-slate-800 focus:ring-sky-400'
                  }`}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold mb-1 block ${theme === 'cinema' ? 'text-amber-300/80' : 'text-slate-500'}`}>
                  {t('type')}
                </label>
                <input
                  value={editTarget.type}
                  onChange={(e) => setEditTarget({ ...editTarget, type: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'bg-stone-900 border border-amber-500/40 text-amber-100 focus:ring-amber-400'
                      : 'border border-slate-200 text-slate-800 focus:ring-sky-400'
                  }`}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold mb-1 block ${theme === 'cinema' ? 'text-amber-300/80' : 'text-slate-500'}`}>
                  {t('meaning')}
                </label>
                <input
                  value={editTarget.meaning}
                  onChange={(e) => setEditTarget({ ...editTarget, meaning: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'bg-stone-900 border border-amber-500/40 text-amber-100 focus:ring-amber-400'
                      : 'border border-slate-200 text-slate-800 focus:ring-sky-400'
                  }`}
                />
              </div>
              <div>
                <label className={`text-xs font-semibold mb-1 block ${theme === 'cinema' ? 'text-amber-300/80' : 'text-slate-500'}`}>
                  {t('category')}
                </label>
                <input
                  value={editTarget.category}
                  onChange={(e) => setEditTarget({ ...editTarget, category: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'bg-stone-900 border border-amber-500/40 text-amber-100 focus:ring-amber-400'
                      : 'border border-slate-200 text-slate-800 focus:ring-sky-400'
                  }`}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setEditTarget(null)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  theme === 'cinema'
                    ? 'text-stone-300 hover:bg-stone-800 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleSaveEdit(editTarget)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm ${
                  theme === 'cinema'
                    ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-bold hover:from-amber-500 hover:to-amber-400'
                    : 'text-white bg-sky-500 hover:bg-sky-600'
                }`}
              >
                {t('saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move category modal */}
      {moveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className={`rounded-2xl border p-6 shadow-2xl max-w-sm w-full ${
            theme === 'cinema'
              ? 'bg-[#1a140f] border-amber-500/40 text-amber-100'
              : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <h3 className={`text-lg font-bold mb-4 ${theme === 'cinema' ? 'text-amber-100 font-serif' : 'text-slate-800'}`}>
              {t('moveTo')}
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMoveCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                    moveCategory === cat
                      ? (theme === 'cinema' ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold' : 'bg-sky-50 text-sky-700 font-semibold')
                      : (theme === 'cinema' ? 'hover:bg-stone-800/80 text-stone-300' : 'hover:bg-slate-50 text-slate-700')
                  }`}
                >
                  <span>{chestDisplayName(cat)}</span>
                  {moveCategory === cat && (
                    <Check className={`w-4 h-4 ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-600'}`} />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setMoveOpen(false)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  theme === 'cinema'
                    ? 'text-stone-300 hover:bg-stone-800 hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleMoveSelected}
                disabled={!moveCategory.trim()}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 ${
                  theme === 'cinema'
                    ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-bold hover:from-amber-500 hover:to-amber-400'
                    : 'text-white bg-sky-500 hover:bg-sky-600'
                }`}
              >
                {t('moveSelected')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={t('confirmDeleteTitle')}
        message={t('confirmDeleteMsg')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={handleDeleteSelected}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Retro Film Roll Modal (35mm Vlog Aesthetics) */}
      <RetroFilmRollModal
        isOpen={filmRollOpen}
        onClose={() => setFilmRollOpen(false)}
        vocabs={filtered.length > 0 ? filtered : vocabs}
      />
    </div>
  );
}
