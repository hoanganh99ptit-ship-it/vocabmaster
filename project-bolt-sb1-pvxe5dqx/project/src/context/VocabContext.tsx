import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { getLocalVocabs, saveLocalVocabs, localToVocab } from '@/lib/storage';
import { autoCategorize } from '@/lib/categorizer';
import { calculateNextSRS } from '@/lib/srs';
import type { Vocabulary, ParsedVocab } from '@/lib/types';

interface VocabContextValue {
  vocabs: Vocabulary[];
  loading: boolean;
  refresh: () => Promise<void>;
  addVocab: (vocab: Omit<ParsedVocab, 'category'> & { category?: string }) => Promise<{ error: string | null }>;
  addManyVocabs: (vocabs: ParsedVocab[]) => Promise<{ error: string | null; count: number }>;
  updateVocab: (id: string, updates: Partial<Pick<Vocabulary, 'word' | 'type' | 'meaning' | 'category' | 'interval' | 'easeFactor' | 'dueDate' | 'repetition'>>) => Promise<{ error: string | null }>;
  deleteVocabs: (ids: string[]) => Promise<{ error: string | null }>;
  incrementError: (word: string) => Promise<void>;
  resetError: (word: string) => Promise<void>;
  updateSRS: (id: string, quality: number) => Promise<{ error: string | null }>;
  deduplicateVocabs: () => Promise<{ error: string | null; removedCount: number }>;
  existingWords: Set<string>;
}

// Helper to detect if Supabase table lacks SRS metadata columns (interval, ease_factor, due_date, repetition)
let dbSupportsSrsColumns: boolean | null = null;

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the') ||
    msg.includes('does not exist') ||
    msg.includes('column')
  );
}

const VocabContext = createContext<VocabContextValue | null>(null);

export function VocabProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const isFirstLoadRef = useRef(true);
  const [vocabs, setVocabs] = useState<Vocabulary[]>([]);
  const [loading, setLoading] = useState(true);

  // Proactively check if the Supabase database supports SRS columns
  const checkSrsSupport = useCallback(async () => {
    if (dbSupportsSrsColumns !== null) return;
    try {
      const { error } = await supabase.from('vocabularies').select('due_date').limit(1);
      if (error && isMissingColumnError(error)) {
        dbSupportsSrsColumns = false;
      } else if (!error) {
        dbSupportsSrsColumns = true;
      }
    } catch {
      dbSupportsSrsColumns = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      // Load from localStorage
      const local = getLocalVocabs();
      setVocabs(local.map((v, i) => localToVocab(v, i)));
      isFirstLoadRef.current = false;
      setLoading(false);
      return;
    }

    if (isFirstLoadRef.current) {
      setLoading(true);
    }
    try {
      const fetchPromise = supabase
        .from('vocabularies')
        .select('*')
        .order('created_at', { ascending: false });

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Supabase fetch timed out' } }), 5000)
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]);
      const { data, error } = result;

      if (!error && data) {
        // Map DB snake_case to camelCase SRS properties
        const mapped: Vocabulary[] = (data as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          user_id: String(row.user_id || ''),
          word: String(row.word || '').trim().toLowerCase(),
          type: String(row.type || '').trim().toLowerCase(),
          meaning: String(row.meaning || '').trim(),
          category: String(row.category || 'General').trim(),
          error_count: Number(row.error_count) || 0,
          created_at: String(row.created_at || new Date().toISOString()),
          interval: Number(row.interval) || 1,
          easeFactor: Number(row.ease_factor) || 2.5,
          dueDate: String(row.due_date || row.created_at || new Date().toISOString()),
          repetition: Number(row.repetition) || 0,
        }));
        setVocabs(mapped);
      } else if (error) {
        console.warn('[VocabContext] Failed to load vocabs from Supabase:', error);
        const local = getLocalVocabs();
        if (local.length > 0) {
          setVocabs(local.map((v, i) => localToVocab(v, i)));
        }
      }
    } catch (err) {
      console.warn('[VocabContext] Unexpected error during refresh:', err);
      const local = getLocalVocabs();
      if (local.length > 0) {
        setVocabs(local.map((v, i) => localToVocab(v, i)));
      }
    } finally {
      isFirstLoadRef.current = false;
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    checkSrsSupport();
    refresh();
  }, [checkSrsSupport, refresh]);

  useEffect(() => {
    const handleUpdate = () => {
      refresh();
    };
    window.addEventListener('vocabmaster_vocabs_updated', handleUpdate);
    return () => window.removeEventListener('vocabmaster_vocabs_updated', handleUpdate);
  }, [refresh]);

  const existingWords = new Set(vocabs.map((v) => v.word.trim().toLowerCase()));

  // 1. ADD SINGLE VOCABULARY (Enforces lowercase trimming & duplicate prevention)
  const addVocab = useCallback(
    async (vocab: Omit<ParsedVocab, 'category'> & { category?: string }) => {
      const cleanWord = vocab.word.trim().toLowerCase();
      const cleanMeaning = vocab.meaning.trim();
      const cleanType = (vocab.type || '').trim().toLowerCase();

      if (!cleanWord || !cleanMeaning) {
        return { error: 'Word and meaning cannot be empty' };
      }

      if (existingWords.has(cleanWord)) {
        return { error: `Word "${cleanWord}" already exists in your vocabulary` };
      }

      const category =
        vocab.category && vocab.category.trim()
          ? vocab.category.trim()
          : autoCategorize(cleanWord, cleanMeaning);

      const now = new Date().toISOString();
      const newEntry: Vocabulary = {
        id: !user ? `local-${Date.now()}` : `temp-${Date.now()}`,
        user_id: user ? user.id : 'local',
        word: cleanWord,
        type: cleanType,
        meaning: cleanMeaning,
        category,
        error_count: 0,
        created_at: now,
        interval: 1,
        easeFactor: 2.5,
        dueDate: now,
        repetition: 0,
      };

      // Optimistic UI update
      const prevVocabs = [...vocabs];
      setVocabs((prev) => [newEntry, ...prev]);

      if (!user) {
        try {
          const local = getLocalVocabs();
          local.push({
            word: cleanWord,
            type: cleanType,
            meaning: cleanMeaning,
            category,
            interval: 1,
            easeFactor: 2.5,
            dueDate: now,
            repetition: 0,
          });
          saveLocalVocabs(local);
          return { error: null };
        } catch (err) {
          setVocabs(prevVocabs);
          return { error: err instanceof Error ? err.message : 'Local storage error' };
        }
      }

      let insertPayload: Record<string, unknown> = {
        user_id: user.id,
        word: cleanWord,
        type: cleanType,
        meaning: cleanMeaning,
        category,
      };

      if (dbSupportsSrsColumns !== false) {
        insertPayload = {
          ...insertPayload,
          interval: 1,
          ease_factor: 2.5,
          due_date: now,
          repetition: 0,
        };
      }

      let { data, error } = await supabase
        .from('vocabularies')
        .insert(insertPayload)
        .select()
        .single();

      if (error && dbSupportsSrsColumns !== false && isMissingColumnError(error)) {
        dbSupportsSrsColumns = false;
        const fallbackPayload = {
          user_id: user.id,
          word: cleanWord,
          type: cleanType,
          meaning: cleanMeaning,
          category,
        };
        const retryResult = await supabase
          .from('vocabularies')
          .insert(fallbackPayload)
          .select()
          .single();
        data = retryResult.data;
        error = retryResult.error;
      } else if (!error && dbSupportsSrsColumns === null) {
        dbSupportsSrsColumns = true;
      }

      if (error) {
        // Rollback optimistic update
        setVocabs(prevVocabs);
        return { error: error.message };
      }

      if (data) {
        setVocabs((prev) =>
          prev.map((v) => (v.id === newEntry.id ? { ...v, id: String(data.id) } : v))
        );
      }

      return { error: null };
    },
    [user, vocabs, existingWords]
  );

  // 2. ADD MANY VOCABULARIES (Batch clean, in-batch deduplication, lowercase trimming)
  const addManyVocabs = useCallback(
    async (newVocabs: ParsedVocab[]) => {
      if (newVocabs.length === 0) return { error: null, count: 0 };

      // Step A: Normalize and clean all input words
      const sanitized = newVocabs
        .map((v) => ({
          word: v.word.trim().toLowerCase(),
          type: (v.type || '').trim().toLowerCase(),
          meaning: v.meaning.trim(),
          category:
            v.category && v.category !== 'General'
              ? v.category.trim()
              : autoCategorize(v.word, v.meaning),
          interval: v.interval ?? 1,
          easeFactor: v.easeFactor ?? 2.5,
          dueDate: v.dueDate ?? new Date().toISOString(),
          repetition: v.repetition ?? 0,
        }))
        .filter((v) => v.word.length > 0 && v.meaning.length > 0);

      // Step B: Deduplicate within the batch itself
      const seenInBatch = new Set<string>();
      const batchUnique: typeof sanitized = [];
      for (const item of sanitized) {
        if (!seenInBatch.has(item.word)) {
          seenInBatch.add(item.word);
          batchUnique.push(item);
        }
      }

      // Step C: Filter out words already in user's database (both local state and Supabase server)
      const existingLower = new Set(vocabs.map((v) => v.word.trim().toLowerCase()));
      if (user) {
        try {
          const { data: dbExisting } = await supabase
            .from('vocabularies')
            .select('word')
            .eq('user_id', user.id);
          if (dbExisting) {
            dbExisting.forEach((row) => {
              if (row.word) existingLower.add(String(row.word).trim().toLowerCase());
            });
          }
        } catch {
          // continue with local state
        }
      }

      const toInsert = batchUnique.filter((v) => !existingLower.has(v.word));

      if (toInsert.length === 0) {
        return { error: null, count: 0 };
      }

      const now = new Date().toISOString();
      const optimisticEntries: Vocabulary[] = toInsert.map((v, idx) => ({
        id: !user ? `local-${Date.now()}-${idx}` : `temp-${Date.now()}-${idx}`,
        user_id: user ? user.id : 'local',
        word: v.word,
        type: v.type,
        meaning: v.meaning,
        category: v.category,
        error_count: 0,
        created_at: now,
        interval: v.interval,
        easeFactor: v.easeFactor,
        dueDate: v.dueDate,
        repetition: v.repetition,
      }));

      // Optimistic UI update
      const prevVocabs = [...vocabs];
      setVocabs((prev) => [...optimisticEntries, ...prev]);

      if (!user) {
        try {
          const local = getLocalVocabs();
          for (const item of toInsert) {
            local.push(item);
          }
          saveLocalVocabs(local);
          return { error: null, count: toInsert.length };
        } catch (err) {
          setVocabs(prevVocabs);
          return { error: err instanceof Error ? err.message : 'Local storage error', count: 0 };
        }
      }

      const buildDbRows = (includeSrs: boolean) =>
        toInsert.map((v) => ({
          user_id: user.id,
          word: v.word,
          type: v.type,
          meaning: v.meaning,
          category: v.category,
          ...(includeSrs
            ? {
                interval: v.interval,
                ease_factor: v.easeFactor,
                due_date: v.dueDate,
                repetition: v.repetition,
              }
            : {}),
        }));

      const shouldTrySrs = dbSupportsSrsColumns !== false;
      let dbRows = buildDbRows(shouldTrySrs);

      let { data, error } = await supabase
        .from('vocabularies')
        .insert(dbRows)
        .select();

      if (error && shouldTrySrs && isMissingColumnError(error)) {
        dbSupportsSrsColumns = false;
        dbRows = buildDbRows(false);
        const retryResult = await supabase
          .from('vocabularies')
          .insert(dbRows)
          .select();
        data = retryResult.data;
        error = retryResult.error;
      } else if (!error && dbSupportsSrsColumns === null) {
        dbSupportsSrsColumns = true;
      }

      // If batch insert encounters any conflict (e.g. unique constraint 23505),
      // fallback to row-by-row insertion so every valid non-duplicate word is safely saved!
      if (error) {
        console.warn('[VocabContext] Batch insert failed, executing resilient row-by-row fallback:', error.message);
        let savedCount = 0;
        const fallbackDbRows = buildDbRows(dbSupportsSrsColumns !== false);

        for (const row of fallbackDbRows) {
          try {
            const { error: singleErr } = await supabase
              .from('vocabularies')
              .insert(row);

            if (!singleErr) {
              savedCount++;
            } else {
              console.info(`[VocabContext] Skipped duplicate/conflicting word "${row.word}":`, singleErr.message);
            }
          } catch (rowErr) {
            console.warn(`[VocabContext] Row insertion error for "${row.word}":`, rowErr);
          }
        }

        if (savedCount > 0) {
          await refresh();
          return { error: null, count: savedCount };
        }

        // If zero words could be saved
        setVocabs(prevVocabs);
        return { error: error.message, count: 0 };
      }

      if (data && Array.isArray(data)) {
        await refresh();
      }

      return { error: null, count: toInsert.length };
    },
    [user, vocabs, refresh]
  );

  // 3. UPDATE VOCABULARY (Optimistic with rollback)
  const updateVocab = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Vocabulary, 'word' | 'type' | 'meaning' | 'category' | 'interval' | 'easeFactor' | 'dueDate' | 'repetition'>>
    ) => {
      const prevVocabs = [...vocabs];
      const sanitizedUpdates: typeof updates = { ...updates };
      if (sanitizedUpdates.word !== undefined) {
        sanitizedUpdates.word = sanitizedUpdates.word.trim().toLowerCase();
      }
      if (sanitizedUpdates.meaning !== undefined) {
        sanitizedUpdates.meaning = sanitizedUpdates.meaning.trim();
      }
      if (sanitizedUpdates.type !== undefined) {
        sanitizedUpdates.type = sanitizedUpdates.type.trim().toLowerCase();
      }
      if (sanitizedUpdates.category !== undefined) {
        sanitizedUpdates.category = sanitizedUpdates.category.trim();
      }

      // Optimistic state update
      setVocabs((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...sanitizedUpdates } : v))
      );

      if (!user) {
        try {
          const local = getLocalVocabs();
          if (id.startsWith('local-')) {
            const idx = parseInt(id.replace('local-', ''), 10);
            if (isNaN(idx) || idx < 0 || idx >= local.length) {
              setVocabs(prevVocabs);
              return { error: 'Item not found' };
            }
            if (sanitizedUpdates.word !== undefined) local[idx].word = sanitizedUpdates.word;
            if (sanitizedUpdates.type !== undefined) local[idx].type = sanitizedUpdates.type;
            if (sanitizedUpdates.meaning !== undefined) local[idx].meaning = sanitizedUpdates.meaning;
            if (sanitizedUpdates.category !== undefined) local[idx].category = sanitizedUpdates.category;
            if (sanitizedUpdates.interval !== undefined) local[idx].interval = sanitizedUpdates.interval;
            if (sanitizedUpdates.easeFactor !== undefined) local[idx].easeFactor = sanitizedUpdates.easeFactor;
            if (sanitizedUpdates.dueDate !== undefined) local[idx].dueDate = sanitizedUpdates.dueDate;
            if (sanitizedUpdates.repetition !== undefined) local[idx].repetition = sanitizedUpdates.repetition;
            saveLocalVocabs(local);
            return { error: null };
          }
          setVocabs(prevVocabs);
          return { error: 'Item not found' };
        } catch (err) {
          setVocabs(prevVocabs);
          return { error: err instanceof Error ? err.message : 'Local update error' };
        }
      }

      const dbUpdates: Record<string, unknown> = {};
      if (sanitizedUpdates.word !== undefined) dbUpdates.word = sanitizedUpdates.word;
      if (sanitizedUpdates.type !== undefined) dbUpdates.type = sanitizedUpdates.type;
      if (sanitizedUpdates.meaning !== undefined) dbUpdates.meaning = sanitizedUpdates.meaning;
      if (sanitizedUpdates.category !== undefined) dbUpdates.category = sanitizedUpdates.category;

      if (dbSupportsSrsColumns !== false) {
        if (sanitizedUpdates.interval !== undefined) dbUpdates.interval = sanitizedUpdates.interval;
        if (sanitizedUpdates.easeFactor !== undefined) dbUpdates.ease_factor = sanitizedUpdates.easeFactor;
        if (sanitizedUpdates.dueDate !== undefined) dbUpdates.due_date = sanitizedUpdates.dueDate;
        if (sanitizedUpdates.repetition !== undefined) dbUpdates.repetition = sanitizedUpdates.repetition;
      }

      let { error } = await supabase.from('vocabularies').update(dbUpdates).eq('id', id);

      if (error && dbSupportsSrsColumns !== false && isMissingColumnError(error)) {
        dbSupportsSrsColumns = false;
        delete dbUpdates.interval;
        delete dbUpdates.ease_factor;
        delete dbUpdates.due_date;
        delete dbUpdates.repetition;

        if (Object.keys(dbUpdates).length > 0) {
          const retryResult = await supabase.from('vocabularies').update(dbUpdates).eq('id', id);
          error = retryResult.error;
        } else {
          error = null;
        }
      } else if (!error && dbSupportsSrsColumns === null) {
        if (
          sanitizedUpdates.interval !== undefined ||
          sanitizedUpdates.easeFactor !== undefined ||
          sanitizedUpdates.dueDate !== undefined ||
          sanitizedUpdates.repetition !== undefined
        ) {
          dbSupportsSrsColumns = true;
        }
      }

      if (error) {
        setVocabs(prevVocabs);
        return { error: error.message };
      }

      return { error: null };
    },
    [user, vocabs]
  );

  // 4. DELETE VOCABULARIES (Optimistic with rollback)
  const deleteVocabs = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return { error: null };

      const prevVocabs = [...vocabs];
      setVocabs((prev) => prev.filter((v) => !ids.includes(v.id)));

      if (!user) {
        try {
          const local = getLocalVocabs();
          const filtered = local.filter((_, i) => !ids.includes(`local-${i}`));
          saveLocalVocabs(filtered);
          return { error: null };
        } catch (err) {
          setVocabs(prevVocabs);
          return { error: err instanceof Error ? err.message : 'Local delete error' };
        }
      }

      const { error } = await supabase.from('vocabularies').delete().in('id', ids);
      if (error) {
        setVocabs(prevVocabs);
        return { error: error.message };
      }

      return { error: null };
    },
    [user, vocabs]
  );

  // 5. UPDATE SPACED REPETITION (SRS) METADATA
  const updateSRS = useCallback(
    async (id: string, quality: number) => {
      const vocab = vocabs.find((v) => v.id === id);
      if (!vocab) return { error: 'Vocabulary not found' };

      const nextSRS = calculateNextSRS(
        quality,
        vocab.interval ?? 1,
        vocab.easeFactor ?? 2.5,
        vocab.repetition ?? 0
      );

      return updateVocab(id, {
        interval: nextSRS.interval,
        easeFactor: nextSRS.easeFactor,
        dueDate: nextSRS.dueDate,
        repetition: nextSRS.repetition,
      });
    },
    [vocabs, updateVocab]
  );

  // 6. DEDUPLICATE DATABASE WORDS (Cleans existing duplicates, keeps the best record)
  const deduplicateVocabs = useCallback(async () => {
    // Group words by normalized word
    const groups = new Map<string, Vocabulary[]>();
    for (const v of vocabs) {
      const key = v.word.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }

    const idsToDelete: string[] = [];

    groups.forEach((group) => {
      if (group.length > 1) {
        // Sort by quality: highest repetition or oldest created
        const sorted = [...group].sort((a, b) => (b.repetition ?? 0) - (a.repetition ?? 0));
        // Keep sorted[0], delete the rest
        for (let i = 1; i < sorted.length; i++) {
          idsToDelete.push(sorted[i].id);
        }
      }
    });

    if (idsToDelete.length === 0) {
      return { error: null, removedCount: 0 };
    }

    const { error } = await deleteVocabs(idsToDelete);
    return { error, removedCount: error ? 0 : idsToDelete.length };
  }, [vocabs, deleteVocabs]);

  const incrementError = useCallback(
    async (word: string) => {
      const target = vocabs.find((v) => v.word.trim().toLowerCase() === word.trim().toLowerCase());
      if (!target) return;
      const newCount = (target.error_count || 0) + 1;
      setVocabs((prev) =>
        prev.map((v) => (v.id === target.id ? { ...v, error_count: newCount } : v))
      );
      if (user) {
        await supabase
          .from('vocabularies')
          .update({ error_count: newCount })
          .eq('id', target.id);
      }
    },
    [user, vocabs]
  );

  const resetError = useCallback(
    async (word: string) => {
      const target = vocabs.find((v) => v.word.trim().toLowerCase() === word.trim().toLowerCase());
      if (!target) return;
      setVocabs((prev) =>
        prev.map((v) => (v.id === target.id ? { ...v, error_count: 0 } : v))
      );
      if (user) {
        await supabase
          .from('vocabularies')
          .update({ error_count: 0 })
          .eq('id', target.id);
      }
    },
    [user, vocabs]
  );

  return (
    <VocabContext.Provider
      value={{
        vocabs,
        loading,
        refresh,
        addVocab,
        addManyVocabs,
        updateVocab,
        deleteVocabs,
        incrementError,
        resetError,
        updateSRS,
        deduplicateVocabs,
        existingWords,
      }}
    >
      {children}
    </VocabContext.Provider>
  );
}

export function useVocab() {
  const ctx = useContext(VocabContext);
  if (!ctx) throw new Error('useVocab must be used within VocabProvider');
  return ctx;
}
