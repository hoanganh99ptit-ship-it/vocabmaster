import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AudioControl } from '@/components/AudioControl';
import { DEFAULT_CHESTS, FALLBACK_CHEST_KEY } from '@/lib/categorizer';
import {
  batchAuditVocabWithGemini,
  normalizeSelectedVocabs,
  type BatchAuditProgress,
} from '@/services/geminiService';
import { isDueForReview, getSRSStage } from '@/lib/srs';
import type { Vocabulary } from '@/lib/types';

export function VocabChest() {
  const { vocabs, deleteVocabs, updateVocab, refresh, deduplicateVocabs } = useVocab();
  const { t, tFn, tFn2, lang } = useLanguage();
  const { show } = useToast();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<Vocabulary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCategory, setMoveCategory] = useState('');
  const [deduplicating, setDeduplicating] = useState(false);

  // Batch audit & normalize state with strict progress tracking
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<BatchAuditProgress | null>(null);
  const [auditAbortController, setAuditAbortController] = useState<AbortController | null>(null);

  // Selected normalization state
  const [normalizingSelected, setNormalizingSelected] = useState(false);

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
      totalChunks: Math.ceil(wordsToAudit.length / 15),
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
      totalChunks: Math.ceil(selectedVocabs.length / 15),
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

  if (vocabs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <div className="w-20 h-20 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <FolderOpen className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700">{t('noWords')}</h3>
        <p className="text-sm text-slate-500 mt-1">{t('noWordsDesc')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-sm font-semibold text-slate-500">{t('totalWords')}</span>
          <span className="text-lg font-bold text-sky-600">{vocabs.length}</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-sm font-semibold text-slate-500">{t('categories')}</span>
          <span className="text-lg font-bold text-teal-600">{chestGroups.length}</span>
        </div>
        <button
          onClick={() => setFilterCategory(filterCategory === 'srs_due' ? 'all' : 'srs_due')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all shadow-sm ${
            filterCategory === 'srs_due'
              ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-200'
              : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span className="text-sm font-semibold">
            {lang === 'vi' ? 'Cần ôn tập hôm nay (SRS)' : 'Due for Review (SRS)'}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
            filterCategory === 'srs_due' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'
          }`}>
            {srsDueCount}
          </span>
        </button>
      </div>

      {/* Chest folder cards */}
      {filterCategory === 'all' && !search.trim() && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">{t('categories')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {chestGroups.map(([cat, words]) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className="group bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-sky-300 transition-all text-left"
              >
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${chestColor(
                    cat
                  )} flex items-center justify-center mb-3 shadow-sm`}
                >
                  <Folder className="w-5 h-5 text-white" />
                </div>
                <p className="font-bold text-slate-800 text-sm truncate">{chestDisplayName(cat)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{tFn('wordsCount', words.length)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky / Prominent AI Progress Bar Banner */}
      {(auditing || normalizingSelected) && auditProgress && (
        <div className="mb-5 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 shadow-md animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                  <span>
                    {auditing
                      ? (lang === 'vi' ? 'Đang dọn dẹp lỗi chính tả với AI...' : 'Cleaning spelling errors with AI...')
                      : (lang === 'vi' ? 'Đang chuẩn hóa các từ đã chọn...' : 'Normalizing selected vocabulary...')}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                    {Math.round((auditProgress.scanned / Math.max(1, auditProgress.total)) * 100)}%
                  </span>
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  {lang === 'vi'
                    ? `Đang kiểm tra từ ${auditProgress.scanned} / ${auditProgress.total}... (Cụm ${auditProgress.currentChunk}/${auditProgress.totalChunks} • 15 từ/lượt)`
                    : `Checking word ${auditProgress.scanned} / ${auditProgress.total}... (Chunk ${auditProgress.currentChunk}/${auditProgress.totalChunks} • 15 words/batch)`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center">
              {auditProgress.errorsFound > 0 && (
                <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                  {lang === 'vi' ? `Đã phát hiện: ${auditProgress.errorsFound} lỗi` : `Found: ${auditProgress.errorsFound} issues`}
                </span>
              )}
              {auditAbortController && (
                <button
                  type="button"
                  onClick={handleCancelAudit}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-sm"
                >
                  {lang === 'vi' ? 'Dừng lại' : 'Stop'}
                </button>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className="w-full bg-amber-200/60 rounded-full h-3 overflow-hidden shadow-inner p-0.5">
            <div
              className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full transition-all duration-300 ease-out shadow-sm"
              style={{
                width: `${Math.min(100, Math.max(3, Math.round((auditProgress.scanned / Math.max(1, auditProgress.total)) * 100)))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Search, Deduplicate, AI Audit & Filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all"
            placeholder={t('searchWords')}
          />
        </div>

        {/* Clean Duplicates Button */}
        <button
          onClick={handleDeduplicate}
          disabled={deduplicating || vocabs.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm disabled:opacity-50 whitespace-nowrap"
          title={lang === 'vi' ? 'Quét và dọn dẹp các từ vựng trùng lặp' : 'Scan and clean duplicate vocabulary'}
        >
          {deduplicating ? <Loader2 className="w-4 h-4 animate-spin text-sky-500" /> : <Layers className="w-4 h-4 text-sky-500" />}
          <span>{lang === 'vi' ? 'Dọn dẹp từ trùng' : 'Clean Duplicates'}</span>
        </button>

        {/* AI Batch Audit */}
        <button
          onClick={handleBatchAudit}
          disabled={auditing || vocabs.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm disabled:opacity-50 whitespace-nowrap"
          title={lang === 'vi' ? 'Quét chính tả và chuẩn hóa từ vựng với Gemini AI' : 'Scan and fix spelling with Gemini AI'}
        >
          {auditing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {auditProgress
                  ? (lang === 'vi'
                      ? `Đang kiểm tra từ ${auditProgress.scanned} / ${auditProgress.total}...`
                      : `Checking ${auditProgress.scanned}/${auditProgress.total}...`)
                  : t('aiBatchAuditing')}
              </span>
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              <span>{t('aiCleanupSpellErrors')}</span>
            </>
          )}
        </button>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
        >
          <option value="all">{t('allCategories')}</option>
          <option value="srs_due">
            {lang === 'vi' ? '⚡ Cần ôn tập hôm nay (SRS)' : '⚡ Due for Review (SRS)'} ({srsDueCount})
          </option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {chestDisplayName(cat)}
            </option>
          ))}
        </select>
      </div>

      {/* Select all & Count */}
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
          />
          {t('selectAll')}
        </label>
        <span className="text-sm text-slate-400">
          {filtered.length} / {vocabs.length}
        </span>
      </div>

      {/* Word cards with Spaced Repetition (SRS) Status Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((vocab) => {
          const srsStage = getSRSStage(vocab.interval, vocab.repetition);
          const isDue = isDueForReview(vocab.dueDate);

          return (
            <div
              key={vocab.id}
              className={`group bg-white rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${
                selected.has(vocab.id) ? 'border-sky-400 ring-2 ring-sky-100' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={selected.has(vocab.id)}
                    onChange={() => toggleSelect(vocab.id)}
                    className="w-4 h-4 mt-1 rounded border-slate-300 text-sky-500 focus:ring-sky-400"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-800 text-lg truncate">{vocab.word}</h3>
                      {vocab.type && (
                        <span className="text-xs font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                          {vocab.type}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{vocab.meaning}</p>

                    {/* Metadata & SRS badges */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span
                        className={`text-[11px] font-semibold text-white bg-gradient-to-r ${chestColor(
                          vocab.category
                        )} px-2 py-0.5 rounded-full`}
                      >
                        {chestDisplayName(vocab.category)}
                      </span>

                      {/* SRS Stage Badge */}
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${srsStage.badgeClass}`}
                        title={`Interval: ${vocab.interval ?? 1}d, Ease: ${vocab.easeFactor ?? 2.5}`}
                      >
                        {lang === 'vi' ? srsStage.labelVi : srsStage.labelEn} ({vocab.interval ?? 1}d)
                      </span>

                      {isDue && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {lang === 'vi' ? 'Cần ôn' : 'Due'}
                        </span>
                      )}

                      {vocab.error_count > 0 && (
                        <span className="text-[11px] font-medium text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                          {vocab.error_count} {t('errorCount').toLowerCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setEditTarget(vocab)}
                  className="text-slate-300 hover:text-sky-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                <AudioControl text={vocab.word} size="sm" showSpeed={false} />
                <button
                  onClick={() => {
                    setSelected(new Set([vocab.id]));
                    setConfirmOpen(true);
                  }}
                  className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating action bar for selected items */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-2xl animate-slide-up">
          <span className="text-sm font-semibold">{selected.size} {t('deleteSelected').toLowerCase()}</span>
          <div className="w-px h-6 bg-slate-600" />
          <button
            onClick={handleNormalizeSelected}
            disabled={normalizingSelected}
            className="flex items-center gap-1.5 text-sm font-semibold text-amber-300 hover:text-amber-200 transition-colors"
          >
            {normalizingSelected ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {tFn('aiFixSelectedCount', selected.size)}
          </button>
          <div className="w-px h-6 bg-slate-600" />
          <button
            onClick={() => setMoveOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-sky-300 hover:text-sky-200 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            {t('moveSelected')}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-rose-300 hover:text-rose-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('deleteSelected')}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xl max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t('editWord')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('word')}</label>
                <input
                  value={editTarget.word}
                  onChange={(e) => setEditTarget({ ...editTarget, word: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('type')}</label>
                <input
                  value={editTarget.type}
                  onChange={(e) => setEditTarget({ ...editTarget, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('meaning')}</label>
                <input
                  value={editTarget.meaning}
                  onChange={(e) => setEditTarget({ ...editTarget, meaning: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('category')}</label>
                <input
                  value={editTarget.category}
                  onChange={(e) => setEditTarget({ ...editTarget, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleSaveEdit(editTarget)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 transition-colors shadow-sm"
              >
                {t('saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move category modal */}
      {moveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t('moveTo')}</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMoveCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${
                    moveCategory === cat ? 'bg-sky-50 text-sky-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>{chestDisplayName(cat)}</span>
                  {moveCategory === cat && <Check className="w-4 h-4 text-sky-600" />}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setMoveOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleMoveSelected}
                disabled={!moveCategory.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 transition-colors shadow-sm disabled:opacity-50"
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
    </div>
  );
}
