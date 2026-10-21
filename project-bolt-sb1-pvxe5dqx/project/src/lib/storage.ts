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

// ============================================================================
// WEEKLY GOALS & STUDY STREAK
// ============================================================================
const WEEKLY_GOAL_KEY = 'vocabmaster_weekly_goal';
const STREAK_KEY = 'vocabmaster_study_streak';

export interface WeeklyGoal {
  targetWords: number; // e.g. 50 words per week
  weekKey: string;     // e.g. "2026-W42"
  reviewedCount: number;
  completedAt: string | null;
}

export interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string | null; // "YYYY-MM-DD"
  activeDatesThisWeek: string[]; // ["2026-10-19", "2026-10-21"]
}

export function getCurrentWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getDaysLeftInWeek(): number {
  const now = new Date();
  const day = now.getDay(); // 0 is Sunday, 1 is Monday
  const dayNum = day === 0 ? 7 : day;
  return Math.max(0, 7 - dayNum);
}

export function getWeeklyGoal(): WeeklyGoal {
  const currentWeek = getCurrentWeekKey();
  try {
    const raw = localStorage.getItem(WEEKLY_GOAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.weekKey === currentWeek) {
          return {
            targetWords: parsed.targetWords || 50,
            weekKey: currentWeek,
            reviewedCount: parsed.reviewedCount || 0,
            completedAt: parsed.completedAt || null,
          };
        }
        // Rollover to new week, preserving chosen targetWords
        const newGoal: WeeklyGoal = {
          targetWords: parsed.targetWords || 50,
          weekKey: currentWeek,
          reviewedCount: 0,
          completedAt: null,
        };
        saveWeeklyGoal(newGoal);
        return newGoal;
      }
    }
  } catch {
    // fallback
  }

  const defaultGoal: WeeklyGoal = {
    targetWords: 50,
    weekKey: currentWeek,
    reviewedCount: 0,
    completedAt: null,
  };
  saveWeeklyGoal(defaultGoal);
  return defaultGoal;
}

export function saveWeeklyGoal(goal: WeeklyGoal): void {
  try {
    localStorage.setItem(WEEKLY_GOAL_KEY, JSON.stringify(goal));
  } catch {
    // noop
  }
}

export function setWeeklyTarget(targetWords: number): WeeklyGoal {
  const goal = getWeeklyGoal();
  goal.targetWords = Math.max(10, targetWords);
  if (goal.reviewedCount >= goal.targetWords && !goal.completedAt) {
    goal.completedAt = new Date().toISOString();
  }
  saveWeeklyGoal(goal);
  return goal;
}

export function getStreakData(): StreakData {
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const lastDate = parsed.lastActiveDate;
        let streak = parsed.currentStreak || 0;
        const best = parsed.bestStreak || streak;

        if (lastDate) {
          const last = new Date(lastDate);
          const today = new Date(todayStr);
          const diffDays = Math.round((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

          // If more than 1 day missed (diffDays > 1), streak has lapsed
          if (diffDays > 1) {
            streak = 0;
          }
        }

        return {
          currentStreak: streak,
          bestStreak: best,
          lastActiveDate: lastDate || null,
          activeDatesThisWeek: Array.isArray(parsed.activeDatesThisWeek) ? parsed.activeDatesThisWeek : [],
        };
      }
    }
  } catch {
    // fallback
  }

  return {
    currentStreak: 0,
    bestStreak: 0,
    lastActiveDate: null,
    activeDatesThisWeek: [],
  };
}

export function saveStreakData(data: StreakData): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
  } catch {
    // noop
  }
}

export function recordStudyActivity(wordsCount = 1): { goal: WeeklyGoal; streak: StreakData; justCompletedGoal: boolean } {
  const goal = getWeeklyGoal();
  goal.reviewedCount += Math.max(1, wordsCount);
  let justCompletedGoal = false;

  if (goal.reviewedCount >= goal.targetWords && !goal.completedAt) {
    goal.completedAt = new Date().toISOString();
    justCompletedGoal = true;
  }
  saveWeeklyGoal(goal);

  // Update streak
  const streak = getStreakData();
  const todayStr = new Date().toISOString().split('T')[0];

  if (streak.lastActiveDate !== todayStr) {
    if (!streak.lastActiveDate) {
      streak.currentStreak = 1;
    } else {
      const last = new Date(streak.lastActiveDate);
      const today = new Date(todayStr);
      const diffDays = Math.round((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak.currentStreak += 1;
      } else {
        streak.currentStreak = 1;
      }
    }
    streak.lastActiveDate = todayStr;
    streak.bestStreak = Math.max(streak.bestStreak, streak.currentStreak);
  }

  // Record active dates this week
  if (!streak.activeDatesThisWeek.includes(todayStr)) {
    streak.activeDatesThisWeek.push(todayStr);
    streak.activeDatesThisWeek = streak.activeDatesThisWeek.slice(-7);
  }

  saveStreakData(streak);
  return { goal, streak, justCompletedGoal };
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
  // Automatically increment weekly review count & streak
  recordStudyActivity(1);
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
