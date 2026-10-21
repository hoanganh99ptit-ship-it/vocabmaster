import type { Vocabulary, ParsedVocab, CollocationItem } from './types';

const LOCAL_KEY = 'vocabmaster_local_vocabs';
const LANG_KEY = 'vocabmaster_lang';
const COLLOCATIONS_KEY = 'vocabmaster_collocations_cache';

export type CollocationMap = Record<string, CollocationItem[]>;

export function getCollocationCache(): CollocationMap {
  try {
    const raw = localStorage.getItem(COLLOCATIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCollocationCache(cache: CollocationMap): void {
  try {
    localStorage.setItem(COLLOCATIONS_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable
  }
}

export function getCollocationsForWordFromCache(word: string): CollocationItem[] | undefined {
  if (!word) return undefined;
  const cache = getCollocationCache();
  return cache[word.trim().toLowerCase()];
}

export function saveCollocationsForWordToCache(word: string, items: CollocationItem[]): void {
  if (!word || !Array.isArray(items)) return;
  const cache = getCollocationCache();
  cache[word.trim().toLowerCase()] = items;
  saveCollocationCache(cache);
}

export function saveBatchCollocationsToCache(newItems: Record<string, CollocationItem[]>): void {
  const cache = getCollocationCache();
  for (const [w, items] of Object.entries(newItems)) {
    if (w && Array.isArray(items)) {
      cache[w.trim().toLowerCase()] = items;
    }
  }
  saveCollocationCache(cache);
}

export function getLocalVocabs(): ParsedVocab[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveLocalVocabs(vocabs: ParsedVocab[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(vocabs));
  } catch {
    // storage full or unavailable
  }
}

export function clearLocalVocabs() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // noop
  }
}

export function hasLocalVocabs(): boolean {
  return getLocalVocabs().length > 0;
}

export function getStoredLang(): 'en' | 'vi' {
  try {
    const lang = localStorage.getItem(LANG_KEY);
    if (lang === 'en' || lang === 'vi') return lang;
  } catch {
    // noop
  }
  return 'vi';
}

export function setStoredLang(lang: 'en' | 'vi') {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // noop
  }
}

// Practice history in localStorage (for analytics before cloud sync)
const PRACTICE_KEY = 'vocabmaster_practice_history';

export interface PracticeRecord {
  type: 'quiz' | 'typing' | 'sentence' | 'cloze';
  vocabId?: string;
  word?: string;
  correct: boolean;
  accuracy?: number;
  timestamp: number;
}

export function getPracticeHistory(): PracticeRecord[] {
  try {
    const raw = localStorage.getItem(PRACTICE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function addPracticeRecord(record: PracticeRecord) {
  const history = getPracticeHistory();
  history.push(record);
  // Keep last 500 records
  const trimmed = history.slice(-500);
  try {
    localStorage.setItem(PRACTICE_KEY, JSON.stringify(trimmed));
  } catch {
    // noop
  }
}

export function clearPracticeHistory() {
  try {
    localStorage.removeItem(PRACTICE_KEY);
  } catch {
    // noop
  }
}

// Convert local vocabs to Vocabulary shape for display
export function localToVocab(local: ParsedVocab, index: number): Vocabulary {
  return {
    id: `local-${index}`,
    user_id: 'local',
    word: local.word.trim().toLowerCase(),
    type: (local.type || '').trim().toLowerCase(),
    meaning: local.meaning.trim(),
    category: local.category || 'General',
    error_count: 0,
    created_at: new Date().toISOString(),
    interval: local.interval ?? 1,
    easeFactor: local.easeFactor ?? 2.5,
    dueDate: local.dueDate ?? new Date().toISOString(),
    repetition: local.repetition ?? 0,
  };
}
