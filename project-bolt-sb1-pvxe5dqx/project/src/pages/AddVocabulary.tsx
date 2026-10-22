import { useState, useRef, useMemo } from 'react';
import { Plus, Upload, FileText, Trash2, Check, FileUp, Loader2, Sparkles, Volume2 } from 'lucide-react';
import { useVocab } from '@/context/VocabContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/components/Toast';
import { parseFile, parseVocabText } from '@/lib/fileParser';
import { autoCategorize, getChestName, DEFAULT_CHESTS, FALLBACK_CHEST_KEY } from '@/lib/categorizer';
import { speak } from '@/lib/speech';
import { autoNormalizeVocabBatch } from '@/services/geminiService';
import { useTheme } from '@/context/ThemeContext';
import type { ParsedVocab } from '@/lib/types';

const AUTO_KEY = '__auto__';

export function AddVocabulary() {
  const { addVocab, addManyVocabs, existingWords, vocabs } = useVocab();
  const { t, tFn, tFn2, tFnStr, lang } = useLanguage();
  const { show } = useToast();
  const { theme } = useTheme();

  const [mode, setMode] = useState<'quick' | 'bulk'>('quick');

  // Quick add
  const [word, setWord] = useState('');
  const [type, setType] = useState('');
  const [meaning, setMeaning] = useState('');
  const [chestChoice, setChestChoice] = useState<string>(AUTO_KEY);
  const [customChest, setCustomChest] = useState('');

  // Bulk import
  const [bulkText, setBulkText] = useState('');
  const [bulkChestChoice, setBulkChestChoice] = useState<string>(AUTO_KEY);
  const [bulkCustomChest, setBulkCustomChest] = useState('');
  const [parsed, setParsed] = useState<ParsedVocab[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // AI auto-normalization state
  const [normalizing, setNormalizing] = useState(false);

  // Existing custom categories from user's vocabs
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    vocabs.forEach((v) => set.add(v.category || 'General'));
    return Array.from(set).sort();
  }, [vocabs]);

  // Build chest options list
  const chestOptions = useMemo(() => {
    const defaults = DEFAULT_CHESTS.map((c) => ({
      key: c.key,
      name: lang === 'vi' ? c.nameVi : c.nameEn,
    }));
    defaults.push({ key: FALLBACK_CHEST_KEY, name: lang === 'vi' ? 'Chung' : 'General' });
    for (const cat of existingCategories) {
      const isDefault = defaults.some((d) => d.key === cat || d.name === cat);
      if (!isDefault) {
        defaults.push({ key: cat, name: cat });
      }
    }
    return defaults;
  }, [existingCategories, lang]);

  const resolveChest = (choice: string, custom: string, w: string, m: string): string => {
    if (custom.trim()) return custom.trim();
    if (choice === AUTO_KEY) return autoCategorize(w, m);
    return choice;
  };

  const resetForm = () => {
    setWord('');
    setType('');
    setMeaning('');
    setChestChoice(AUTO_KEY);
    setCustomChest('');
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !meaning.trim()) {
      show(t('fillAllFields'), 'error');
      return;
    }
    if (existingWords.has(word.trim().toLowerCase())) {
      show(t('wordExists'), 'error');
      return;
    }

    setNormalizing(true);
    try {
      const normalized = await autoNormalizeVocabBatch([
        { word: word.trim(), meaning: meaning.trim(), type: type.trim() },
      ]);
      const entry = normalized[0];
      const finalWord = entry.word;
      const finalType = entry.partOfSpeech;
      const finalMeaning = entry.meaning;

      // Check for duplicate after correction
      if (existingWords.has(finalWord.toLowerCase())) {
        show(t('wordExists'), 'error');
        setNormalizing(false);
        return;
      }

      const finalCategory = resolveChest(chestChoice, customChest, finalWord, finalMeaning);
      const { error } = await addVocab({
        word: finalWord,
        type: finalType,
        meaning: finalMeaning,
        category: finalCategory,
      });

      if (error) {
        show(error || t('toastError'), 'error');
      } else {
        if (entry.wasAutoCorrected && entry.originalWord.toLowerCase() !== finalWord.toLowerCase()) {
          show(tFnStr('aiAutoCorrected', entry.originalWord, finalWord), 'success');
        } else {
          const chestName = getChestName(finalCategory, lang);
          show(`${t('addSuccess')} — ${t('autoCategorized')} ${chestName}`, 'success');
        }
        resetForm();
      }
    } catch {
      // Gemini failed: save user's original input with notice (graceful fallback)
      const finalCategory = resolveChest(chestChoice, customChest, word.trim(), meaning.trim());
      const { error } = await addVocab({
        word: word.trim(),
        type: type.trim(),
        meaning: meaning.trim(),
        category: finalCategory,
      });
      if (error) {
        show(error || t('toastError'), 'error');
      } else {
        show(t('aiSavedUnvalidated'), 'success');
        resetForm();
      }
    }
    setNormalizing(false);
  };

  // Set of existing words normalized
  const existingSet = useMemo(() => {
    return new Set(vocabs.map((v) => v.word.trim().toLowerCase()));
  }, [vocabs]);

  const isWordDuplicate = (w: string) => existingSet.has(w.trim().toLowerCase());

  const handleParseText = () => {
    if (!bulkText.trim()) return;
    setParsing(true);
    const baseCat = bulkCustomChest.trim() || (bulkChestChoice === AUTO_KEY ? '' : bulkChestChoice);
    const result = parseVocabText(bulkText, baseCat || 'General');
    let autoResult: ParsedVocab[] = [];
    if (bulkChestChoice === AUTO_KEY && !bulkCustomChest.trim()) {
      autoResult = result.map((v) => ({
        ...v,
        category: autoCategorize(v.word, v.meaning),
      }));
    } else {
      const finalCat = bulkCustomChest.trim() || getChestName(bulkChestChoice, lang);
      autoResult = result.map((v) => ({ ...v, category: finalCat }));
    }
    setParsed(autoResult);

    // Auto-select ONLY new words by default; existing duplicate words remain unselected
    const newIndices = new Set<number>();
    autoResult.forEach((v, idx) => {
      if (!existingSet.has(v.word.trim().toLowerCase())) {
        newIndices.add(idx);
      }
    });
    setSelectedIndices(newIndices.size > 0 ? newIndices : new Set(autoResult.map((_, i) => i)));
    setParsing(false);
    if (result.length === 0) {
      show(t('noWordsParsed'), 'error');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const baseCat = bulkCustomChest.trim() || (bulkChestChoice === AUTO_KEY ? '' : bulkChestChoice);
      const result = await parseFile(file, baseCat || 'General');
      let autoResult: ParsedVocab[] = [];
      if (bulkChestChoice === AUTO_KEY && !bulkCustomChest.trim()) {
        autoResult = result.map((v) => ({
          ...v,
          category: autoCategorize(v.word, v.meaning),
        }));
      } else {
        const finalCat = bulkCustomChest.trim() || getChestName(bulkChestChoice, lang);
        autoResult = result.map((v) => ({ ...v, category: finalCat }));
      }
      setParsed(autoResult);

      // Auto-select ONLY new words by default; existing duplicate words remain unselected
      const newIndices = new Set<number>();
      autoResult.forEach((v, idx) => {
        if (!existingSet.has(v.word.trim().toLowerCase())) {
          newIndices.add(idx);
        }
      });
      setSelectedIndices(newIndices.size > 0 ? newIndices : new Set(autoResult.map((_, i) => i)));
      if (result.length === 0) {
        show(t('noWordsParsed'), 'error');
      }
    } catch {
      show(t('toastError'), 'error');
    }
    setParsing(false);
  };

  const handleSaveSelected = async () => {
    const selected = parsed.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    setNormalizing(true);
    try {
      const normalized = await autoNormalizeVocabBatch(
        selected.map((v) => ({ word: v.word, meaning: v.meaning, type: v.type })),
      );

      // Build cleaned vocabs, preserving categories
      const cleanedVocabs: ParsedVocab[] = selected.map((v, i) => {
        const norm = normalized[i];
        return {
          word: (norm?.word || v.word).trim(),
          type: (norm?.partOfSpeech || v.type).trim(),
          meaning: (norm?.meaning || v.meaning).trim(),
          category: v.category,
        };
      });

      // Filter out duplicates against current existing words
      const unique = cleanedVocabs.filter((v) => !existingSet.has(v.word.toLowerCase()));
      const skippedCount = cleanedVocabs.length - unique.length;

      if (unique.length === 0) {
        show(
          lang === 'vi'
            ? 'Tất cả các từ đã chọn đều đã có sẵn trong rương từ vựng của bạn!'
            : 'All selected words already exist in your vocabulary chest!',
          'error'
        );
        setNormalizing(false);
        return;
      }

      const { error, count } = await addManyVocabs(unique);
      if (error) {
        show(error || t('toastError'), 'error');
      } else {
        const correctedCount = normalized.filter(
          (n) => n.wasAutoCorrected,
        ).length;
        let msg = tFn2('aiBatchNormalized', count, correctedCount);
        if (skippedCount > 0) {
          msg += lang === 'vi'
            ? ` (Đã tự động bỏ qua ${skippedCount} từ đã có trong rương)`
            : ` (Automatically skipped ${skippedCount} existing words)`;
        }
        show(msg, 'success');
        setParsed([]);
        setSelectedIndices(new Set());
        setBulkText('');
        setFileName('');
      }
    } catch (err) {
      console.warn('[AddVocabulary] Save selected AI error, fallback to selected items:', err);
      // Gemini failed: save original selected vocabs with notice (graceful fallback)
      const uniqueSelected = selected.filter((v) => !existingSet.has(v.word.trim().toLowerCase()));
      const skippedCount = selected.length - uniqueSelected.length;

      if (uniqueSelected.length === 0) {
        show(
          lang === 'vi'
            ? 'Tất cả các từ đã chọn đều đã có sẵn trong rương từ vựng của bạn!'
            : 'All selected words already exist in your vocabulary chest!',
          'error'
        );
        setNormalizing(false);
        return;
      }

      const { error, count } = await addManyVocabs(uniqueSelected);
      if (error) {
        show(error || t('toastError'), 'error');
      } else {
        let msg = `${tFn('toastImported', count)} — ${t('aiSavedUnvalidated')}`;
        if (skippedCount > 0) {
          msg += lang === 'vi'
            ? ` (Đã tự động bỏ qua ${skippedCount} từ đã có trong rương)`
            : ` (Automatically skipped ${skippedCount} existing words)`;
        }
        show(msg, 'success');
        setParsed([]);
        setSelectedIndices(new Set());
        setBulkText('');
        setFileName('');
      }
    }
    setNormalizing(false);
  };

  const toggleSelect = (i: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const selectOnlyNew = () => {
    const newIndices = new Set<number>();
    parsed.forEach((v, idx) => {
      if (!isWordDuplicate(v.word)) {
        newIndices.add(idx);
      }
    });
    setSelectedIndices(newIndices);
  };

  const duplicateCount = useMemo(() => {
    return parsed.filter((v) => isWordDuplicate(v.word)).length;
  }, [parsed, existingSet]);
  const newCount = parsed.length - duplicateCount;

  const toggleSelectAll = () => {
    if (selectedIndices.size === parsed.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsed.map((_, i) => i)));
    }
  };

  const removeFromParsed = (i: number) => {
    setParsed((prev) => prev.filter((_, idx) => idx !== i));
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      }
      return next;
    });
  };

  const updateParsedCategory = (i: number, newCat: string) => {
    setParsed((prev) => prev.map((v, idx) => idx === i ? { ...v, category: newCat } : v));
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Mode toggle */}
      <div className={`flex gap-2 mb-6 p-1 rounded-xl w-fit ${
        theme === 'cinema' ? 'bg-stone-900/90 border border-amber-500/30' : 'bg-slate-100'
      }`}>
        <button
          onClick={() => setMode('quick')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === 'quick'
              ? (theme === 'cinema' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'bg-white text-sky-700 shadow-sm')
              : (theme === 'cinema' ? 'text-stone-400 hover:text-amber-200' : 'text-slate-500')
          }`}
        >
          <Plus className="w-4 h-4" />
          {t('quickAdd')}
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === 'bulk'
              ? (theme === 'cinema' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'bg-white text-sky-700 shadow-sm')
              : (theme === 'cinema' ? 'text-stone-400 hover:text-amber-200' : 'text-slate-500')
          }`}
        >
          <Upload className="w-4 h-4" />
          {t('bulkImport')}
        </button>
      </div>

      {/* Quick Add */}
      {mode === 'quick' && (
        <div className={`rounded-2xl border p-6 shadow-sm ${
          theme === 'cinema'
            ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
            : 'bg-white border-slate-200'
        }`}>
          <form onSubmit={handleQuickAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${
                  theme === 'cinema' ? 'text-amber-300/90' : 'text-slate-700'
                }`}>
                  {t('word')}
                </label>
                <input
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
                  }`}
                  placeholder={t('wordPlaceholder')}
                />
              </div>
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${
                  theme === 'cinema' ? 'text-amber-300/90' : 'text-slate-700'
                }`}>
                  {t('type')}
                </label>
                <input
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
                  }`}
                  placeholder={t('typePlaceholder')}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${
                  theme === 'cinema' ? 'text-amber-300/90' : 'text-slate-700'
                }`}>
                  {t('meaning')}
                </label>
                <input
                  value={meaning}
                  onChange={(e) => setMeaning(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
                  }`}
                  placeholder={t('meaningPlaceholder')}
                />
              </div>
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${
                  theme === 'cinema' ? 'text-amber-300/90' : 'text-slate-700'
                }`}>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className={`w-3.5 h-3.5 ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-500'}`} />
                    {t('chest')}
                  </span>
                </label>
                <select
                  value={chestChoice}
                  onChange={(e) => { setChestChoice(e.target.value); setCustomChest(''); }}
                  className={`w-full px-4 py-2.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'border-amber-500/40 bg-stone-900 text-amber-100 focus:ring-amber-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 focus:ring-sky-400'
                  }`}
                >
                  <option value={AUTO_KEY}>{t('autoDetect')}</option>
                  {chestOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {chestChoice === AUTO_KEY && !customChest && (
              <div>
                <label className={`block text-sm font-semibold mb-1.5 ${
                  theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'
                }`}>
                  {t('orCreateNew')}
                </label>
                <input
                  value={customChest}
                  onChange={(e) => setCustomChest(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                    theme === 'cinema'
                      ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
                  }`}
                  placeholder={t('newCategory')}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={normalizing}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-70 ${
                theme === 'cinema'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-bold hover:from-amber-500 hover:to-amber-400'
                  : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold hover:from-sky-600 hover:to-teal-600'
              }`}
            >
              {normalizing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('aiAutoNormalizing')}
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  {t('addWord')}
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Bulk Import */}
      {mode === 'bulk' && (
        <div className="space-y-6">
          {/* Chest selector for bulk */}
          <div className={`rounded-2xl border p-4 shadow-sm ${
            theme === 'cinema'
              ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
              : 'bg-white border-slate-200'
          }`}>
            <label className={`block text-sm font-semibold mb-1.5 ${
              theme === 'cinema' ? 'text-amber-300/90' : 'text-slate-700'
            }`}>
              <span className="flex items-center gap-1.5">
                <Sparkles className={`w-3.5 h-3.5 ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-500'}`} />
                {t('chest')}
              </span>
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={bulkChestChoice}
                onChange={(e) => { setBulkChestChoice(e.target.value); setBulkCustomChest(''); }}
                className={`flex-1 px-4 py-2.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 ${
                  theme === 'cinema'
                    ? 'border-amber-500/40 bg-stone-900 text-amber-100 focus:ring-amber-400'
                    : 'border-slate-200 bg-slate-50 text-slate-800 focus:ring-sky-400'
                }`}
              >
                <option value={AUTO_KEY}>{t('autoDetect')}</option>
                {chestOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.name}</option>
                ))}
              </select>
              <input
                value={bulkCustomChest}
                onChange={(e) => setBulkCustomChest(e.target.value)}
                className={`flex-1 px-4 py-2.5 rounded-xl border transition-all focus:outline-none focus:ring-2 ${
                  theme === 'cinema'
                    ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                    : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
                }`}
                placeholder={t('orCreateNew')}
              />
            </div>
            {bulkChestChoice === AUTO_KEY && !bulkCustomChest.trim() && (
              <p className={`mt-2 text-xs flex items-center gap-1 ${
                theme === 'cinema' ? 'text-amber-400/90' : 'text-sky-600'
              }`}>
                <Sparkles className="w-3 h-3" />
                {t('autoDetected')} — {t('autoCategorized')} {lang === 'vi' ? 'từng từ' : 'each word individually'}
              </p>
            )}
          </div>

          {/* File upload */}
          <div className={`rounded-2xl border p-6 shadow-sm ${
            theme === 'cinema'
              ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
              : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-2 mb-4">
              <FileUp className={`w-5 h-5 ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-500'}`} />
              <h3 className={`font-bold ${theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'}`}>
                {t('importFromFile')}
              </h3>
            </div>
            <p className={`text-sm mb-3 ${theme === 'cinema' ? 'text-stone-400' : 'text-slate-500'}`}>
              {t('supportedFormats')}
            </p>
            <p className={`text-sm mb-4 font-mono rounded-lg px-3 py-2 border ${
              theme === 'cinema'
                ? 'bg-stone-900/80 border-amber-500/30 text-amber-200'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}>
              {t('parseFormat')}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed font-semibold transition-colors ${
                  theme === 'cinema'
                    ? 'border-amber-500/40 text-amber-300 hover:border-amber-400 hover:text-amber-100 hover:bg-stone-900/60'
                    : 'border-slate-300 text-slate-600 hover:border-sky-400 hover:text-sky-600'
                }`}
              >
                <Upload className="w-5 h-5" />
                {t('selectFile')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              {fileName && (
                <span className={`text-sm flex items-center gap-1 ${
                  theme === 'cinema' ? 'text-amber-200/80' : 'text-slate-500'
                }`}>
                  <FileText className="w-4 h-4" />
                  {fileName}
                </span>
              )}
            </div>
          </div>

          {/* Text paste */}
          <div className={`rounded-2xl border p-6 shadow-sm ${
            theme === 'cinema'
              ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
              : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-2 mb-4">
              <FileText className={`w-5 h-5 ${theme === 'cinema' ? 'text-amber-400' : 'text-sky-500'}`} />
              <h3 className={`font-bold ${theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'}`}>
                {t('importFromText')}
              </h3>
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              className={`w-full px-4 py-3 rounded-xl border transition-all resize-y focus:outline-none focus:ring-2 ${
                theme === 'cinema'
                  ? 'border-amber-500/40 bg-stone-900 text-amber-100 placeholder-stone-500 focus:ring-amber-400'
                  : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:ring-sky-400'
              }`}
              placeholder={t('pasteHere')}
            />
            <button
              onClick={handleParseText}
              disabled={parsing || !bulkText.trim()}
              className={`mt-3 flex items-center gap-2.5 px-6 py-2.5 rounded-xl transition-all font-semibold text-sm shadow-sm ${
                theme === 'cinema'
                  ? bulkText.trim()
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-stone-950 font-bold border border-amber-300 shadow-md shadow-amber-950/40 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                    : 'bg-stone-900 border border-amber-500/30 text-stone-500 cursor-not-allowed opacity-60'
                  : bulkText.trim()
                    ? 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-semibold shadow-md shadow-sky-500/20 hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                    : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-75'
              }`}
            >
              {parsing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText
                  className={`w-4 h-4 ${
                    bulkText.trim()
                      ? theme === 'cinema'
                        ? 'text-stone-950'
                        : 'text-white'
                      : theme === 'cinema'
                      ? 'text-stone-500'
                      : 'text-slate-400'
                  }`}
                />
              )}
              <span>{parsing ? t('parsing') : t('parseText')}</span>
            </button>
          </div>

          {/* Preview */}
          {parsed.length > 0 && (
            <div className={`rounded-2xl border shadow-sm overflow-hidden ${
              theme === 'cinema'
                ? 'bg-[#18130e] border-amber-500/35 text-amber-100'
                : 'bg-white border-slate-200'
            }`}>
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b ${
                theme === 'cinema' ? 'border-amber-500/30 bg-stone-900/80' : 'border-slate-100 bg-slate-50/50'
              }`}>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <h3 className={`font-bold ${theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'}`}>
                    {t('preview')}
                  </h3>
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-full border ${
                    theme === 'cinema'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-sky-50 text-sky-600 border-sky-100'
                  }`}>
                    {parsed.length} {t('parsedWords')}
                  </span>
                  {duplicateCount > 0 && (
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      theme === 'cinema'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {lang === 'vi' ? `${newCount} từ mới, ${duplicateCount} đã có` : `${newCount} new, ${duplicateCount} exist`}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={selectOnlyNew}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        theme === 'cinema'
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-500/40'
                          : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                      }`}
                    >
                      {lang === 'vi' ? `Chỉ chọn ${newCount} từ mới` : `Select ${newCount} new only`}
                    </button>
                  )}
                  <label className={`flex items-center gap-2 text-sm font-semibold cursor-pointer ${
                    theme === 'cinema' ? 'text-stone-300' : 'text-slate-600'
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedIndices.size === parsed.length && parsed.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-amber-500/40 text-amber-500 focus:ring-amber-400 cursor-pointer"
                    />
                    {t('selectAll')}
                  </label>
                  <button
                    onClick={handleSaveSelected}
                    disabled={normalizing || selectedIndices.size === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all shadow-sm disabled:opacity-50 cursor-pointer ${
                      theme === 'cinema'
                        ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-bold hover:from-amber-500 hover:to-amber-400'
                        : 'bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600'
                    }`}
                  >
                    {normalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {normalizing ? t('aiAutoNormalizing') : `${t('saveSelected')} (${selectedIndices.size})`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={theme === 'cinema' ? 'bg-stone-900/90' : 'bg-slate-50'}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('word')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('type')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('meaning')}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-stone-400 uppercase tracking-wider">{t('chest')}</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${theme === 'cinema' ? 'divide-amber-500/20' : 'divide-slate-100'}`}>
                    {parsed.map((item, i) => {
                      const isDup = isWordDuplicate(item.word);
                      return (
                        <tr
                          key={i}
                          className={`transition-colors ${
                            isDup
                              ? (theme === 'cinema' ? 'bg-amber-950/30 hover:bg-amber-950/50' : 'bg-amber-50/40 hover:bg-amber-50/70')
                              : (theme === 'cinema' ? 'hover:bg-stone-900/60' : 'hover:bg-slate-50')
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIndices.has(i)}
                              onChange={() => toggleSelect(i)}
                              className="w-4 h-4 rounded border-amber-500/40 text-amber-500 focus:ring-amber-400 cursor-pointer"
                            />
                          </td>
                          <td className={`px-4 py-3 text-sm font-semibold ${theme === 'cinema' ? 'text-amber-100' : 'text-slate-800'}`}>
                            <div className="flex items-center gap-2">
                              <span>{item.word}</span>
                              {isDup && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 border ${
                                  theme === 'cinema'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}>
                                  {lang === 'vi' ? 'Đã có trong rương' : 'Already in chest'}
                                </span>
                              )}
                            </div>
                          </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => speak(item.word)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                              theme === 'cinema'
                                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                                : 'bg-sky-50 hover:bg-sky-100 text-sky-500'
                            }`}
                            title={t('playAudio')}
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                        <td className={`px-4 py-3 text-sm ${theme === 'cinema' ? 'text-stone-300' : 'text-slate-600'}`}>{item.type || '—'}</td>
                        <td className={`px-4 py-3 text-sm ${theme === 'cinema' ? 'text-stone-200' : 'text-slate-600'}`}>{item.meaning}</td>
                        <td className="px-4 py-3">
                          <select
                            value={item.category}
                            onChange={(e) => updateParsedCategory(i, e.target.value)}
                            className={`text-xs font-medium rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-2 cursor-pointer ${
                              theme === 'cinema'
                                ? 'bg-stone-900 border-amber-500/40 text-amber-200 focus:ring-amber-400'
                                : 'bg-slate-100 border-slate-200 text-slate-600 focus:ring-sky-400'
                            }`}
                          >
                            {chestOptions.map((opt) => (
                              <option key={opt.key} value={opt.name}>{opt.name}</option>
                            ))}
                            {item.category && !chestOptions.some((o) => o.name === item.category) && (
                              <option value={item.category}>{item.category}</option>
                            )}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => removeFromParsed(i)}
                            className="text-stone-400 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
