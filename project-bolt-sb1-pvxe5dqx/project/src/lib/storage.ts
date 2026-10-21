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
// WEEKLY GOALS & STUDY STREAK (WITH REWARD & PENALTY COMMITMENT)
// ============================================================================
const WEEKLY_GOAL_KEY = 'vocabmaster_weekly_goal';
const STREAK_KEY = 'vocabmaster_study_streak';

export const DEFAULT_REWARD = 'Tự thưởng 1 ly trà sữa / bữa ăn yêu thích 🧋';
export const DEFAULT_PENALTY = 'Chạy bộ 3km hoặc chép phạt 20 từ vựng ra giấy 🏃';

export const REWARD_SUGGESTIONS = [
  'Tự thưởng 1 ly trà sữa / cà phê yêu thích 🧋',
  'Thưởng 1 bữa lẩu / nướng tưng bừng cuối tuần 🍲',
  'Xem 1 bộ phim yêu thích cuối tuần không áy náy 🎬',
  'Tự mua 1 món đồ yêu thích trong danh sách mong muốn 🛍️',
  'Dành 2 tiếng chơi game / giải trí thả ga 🎮',
];

export const PENALTY_SUGGESTIONS = [
  'Chép phạt 20 từ vựng ra sổ tay ghi nhớ ✍️',
  'Chạy bộ 3km hoặc hít đất 50 cái 🏃',
  'Không uống trà sữa / ăn vặt trong 1 tuần 🚫',
  'Dọn dẹp sạch sẽ toàn bộ phòng ốc 🧹',
  'Bỏ 50.000đ vào ống heo tiết kiệm 💰',
];

export interface WeeklyGoal {
  weekKey: string;     // e.g. "2026-W42"
  // Specific targets per feature
  quizTarget: number;   // default: 30
  quizReviewed: number; // completed quiz items this week
  clozeTarget: number;  // default: 20
  clozeReviewed: number;// completed cloze items this week
  // Total summary
  targetWords: number;  // default: 50 (sum of targets)
  reviewedCount: number;// total items completed
  // Reward & Penalty commitment contract
  rewardText: string;
  penaltyText: string;
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
        const quizTarget = typeof parsed.quizTarget === 'number' ? parsed.quizTarget : 30;
        const clozeTarget = typeof parsed.clozeTarget === 'number' ? parsed.clozeTarget : 20;
        const targetWords = typeof parsed.targetWords === 'number' ? parsed.targetWords : (quizTarget + clozeTarget);
        const rewardText = parsed.rewardText || DEFAULT_REWARD;
        const penaltyText = parsed.penaltyText || DEFAULT_PENALTY;

        if (parsed.weekKey === currentWeek) {
          return {
            weekKey: currentWeek,
            quizTarget,
            quizReviewed: parsed.quizReviewed || 0,
            clozeTarget,
            clozeReviewed: parsed.clozeReviewed || 0,
            targetWords,
            reviewedCount: parsed.reviewedCount || 0,
            rewardText,
            penaltyText,
            completedAt: parsed.completedAt || null,
          };
        }
        // Rollover to new week, preserving targets and reward/penalty contract
        const newGoal: WeeklyGoal = {
          weekKey: currentWeek,
          quizTarget,
          quizReviewed: 0,
          clozeTarget,
          clozeReviewed: 0,
          targetWords,
          reviewedCount: 0,
          rewardText,
          penaltyText,
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
    weekKey: currentWeek,
    quizTarget: 30,
    quizReviewed: 0,
    clozeTarget: 20,
    clozeReviewed: 0,
    targetWords: 50,
    reviewedCount: 0,
    rewardText: DEFAULT_REWARD,
    penaltyText: DEFAULT_PENALTY,
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

export function updateWeeklyGoal(
  params: Partial<Pick<WeeklyGoal, 'quizTarget' | 'clozeTarget' | 'targetWords' | 'rewardText' | 'penaltyText'>>
): WeeklyGoal {
  const goal = getWeeklyGoal();
  if (params.quizTarget !== undefined) goal.quizTarget = Math.max(5, params.quizTarget);
  if (params.clozeTarget !== undefined) goal.clozeTarget = Math.max(5, params.clozeTarget);
  if (params.targetWords !== undefined) {
    goal.targetWords = Math.max(10, params.targetWords);
  } else {
    goal.targetWords = goal.quizTarget + goal.clozeTarget;
  }
  if (params.rewardText !== undefined) goal.rewardText = params.rewardText.trim() || DEFAULT_REWARD;
  if (params.penaltyText !== undefined) goal.penaltyText = params.penaltyText.trim() || DEFAULT_PENALTY;

  const isAchieved = goal.quizReviewed >= goal.quizTarget && goal.clozeReviewed >= goal.clozeTarget;
  if (isAchieved && !goal.completedAt) {
    goal.completedAt = new Date().toISOString();
  } else if (!isAchieved && goal.completedAt) {
    goal.completedAt = null;
  }

  saveWeeklyGoal(goal);
  return goal;
}

export function setWeeklyTarget(targetWords: number): WeeklyGoal {
  return updateWeeklyGoal({ targetWords });
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

export function recordStudyActivity(
  wordsCount = 1,
  type?: 'quiz' | 'cloze' | 'typing' | 'sentence'
): { goal: WeeklyGoal; streak: StreakData; justCompletedGoal: boolean } {
  const goal = getWeeklyGoal();
  const wasAchieved = goal.quizReviewed >= goal.quizTarget && goal.clozeReviewed >= goal.clozeTarget;

  if (type === 'quiz') {
    goal.quizReviewed += Math.max(1, wordsCount);
  } else if (type === 'cloze') {
    goal.clozeReviewed += Math.max(1, wordsCount);
  }
  goal.reviewedCount += Math.max(1, wordsCount);

  let justCompletedGoal = false;
  const isNowAchieved = goal.quizReviewed >= goal.quizTarget && goal.clozeReviewed >= goal.clozeTarget;

  if (!wasAchieved && isNowAchieved && !goal.completedAt) {
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
  // Automatically increment weekly review count & streak with specific exercise type
  recordStudyActivity(1, record.type);
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
