import type { Vocabulary, ParsedVocab, CollocationItem } from './types';

const LOCAL_KEY = 'vocabmaster_local_vocabs';
const LANG_KEY = 'vocabmaster_lang';
const COLLOCATIONS_KEY = 'vocabmaster_collocations_cache';
const EXAMPLES_KEY = 'vocabmaster_examples_cache';

export interface StoredExample {
  sentence: string;
  translation: string;
}

export type ExampleMap = Record<string, StoredExample>;

export function getExampleCache(): ExampleMap {
  try {
    const raw = localStorage.getItem(EXAMPLES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getExampleForWordFromCache(word: string): StoredExample | undefined {
  if (!word) return undefined;
  const cache = getExampleCache();
  return cache[word.trim().toLowerCase()];
}

export function saveExampleForWordToCache(word: string, example: StoredExample): void {
  if (!word || !example?.sentence) return;
  const cache = getExampleCache();
  cache[word.trim().toLowerCase()] = example;
  try {
    localStorage.setItem(EXAMPLES_KEY, JSON.stringify(cache));
  } catch {}
}

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
// WEEKLY GOALS & STUDY STREAK (WITH 4 DIFFICULTY LEVELS & SYSTEM PENALTY LOCKOUT)
// ============================================================================
const WEEKLY_GOAL_KEY = 'vocabmaster_weekly_goal';
const STREAK_KEY = 'vocabmaster_study_streak';
const PENALTY_STATE_KEY = 'vocabmaster_active_penalty';

export type GoalDifficulty = 'easy' | 'medium' | 'hard' | 'nightmare';

export interface DifficultyConfig {
  key: GoalDifficulty;
  nameVi: string;
  nameEn: string;
  badgeColor: string;
  descriptionVi: string;
  quizTarget: number;
  clozeTarget: number;
  penaltyQuiz: number;
  penaltyCloze: number;
}

export const DIFFICULTY_CONFIGS: Record<GoalDifficulty, DifficultyConfig> = {
  easy: {
    key: 'easy',
    nameVi: 'Dễ',
    nameEn: 'Easy',
    badgeColor: 'emerald',
    descriptionVi: 'Phù hợp khi tuần bận rộn hoặc mới khởi động',
    quizTarget: 15,
    clozeTarget: 10,
    penaltyQuiz: 15,
    penaltyCloze: 10,
  },
  medium: {
    key: 'medium',
    nameVi: 'Trung Bình',
    nameEn: 'Medium',
    badgeColor: 'sky',
    descriptionVi: 'Mức chuẩn cân bằng, duy trì phong độ đều đặn',
    quizTarget: 30,
    clozeTarget: 20,
    penaltyQuiz: 30,
    penaltyCloze: 20,
  },
  hard: {
    key: 'hard',
    nameVi: 'Khó',
    nameEn: 'Hard',
    badgeColor: 'amber',
    descriptionVi: 'Bứt phá vốn từ, thử thách giới hạn bản thân',
    quizTarget: 60,
    clozeTarget: 40,
    penaltyQuiz: 50,
    penaltyCloze: 30,
  },
  nightmare: {
    key: 'nightmare',
    nameVi: 'Cực khó',
    nameEn: 'Nightmare',
    badgeColor: 'rose',
    descriptionVi: 'Cường độ cao nhất, kỷ luật thép tuyệt đối',
    quizTarget: 100,
    clozeTarget: 70,
    penaltyQuiz: 80,
    penaltyCloze: 50,
  },
};

/**
 * Automatically classifies weekly challenge difficulty based on custom Quiz and Cloze targets.
 * Cloze questions require in-depth sentence context understanding, so they are weighted 1.5x.
 * - Score < 45 => 'easy' (Dễ)
 * - 45 <= Score < 90 => 'medium' (Trung bình)
 * - 90 <= Score < 165 => 'hard' (Khó)
 * - Score >= 165 => 'nightmare' (Cực khó)
 */
export function calculateDifficulty(quizTarget: number, clozeTarget: number): GoalDifficulty {
  const safeQuiz = Math.max(0, Number(quizTarget) || 0);
  const safeCloze = Math.max(0, Number(clozeTarget) || 0);
  const weightedScore = safeQuiz + safeCloze * 1.5;

  if (weightedScore < 45) return 'easy';
  if (weightedScore < 90) return 'medium';
  if (weightedScore < 165) return 'hard';
  return 'nightmare';
}

/**
 * Calculates proportional penalty requirements when a user fails their weekly targets.
 */
export function getPenaltyRequirements(quizTarget: number, clozeTarget: number): { penaltyQuiz: number; penaltyCloze: number } {
  const safeQuiz = Math.max(5, Number(quizTarget) || 5);
  const safeCloze = Math.max(5, Number(clozeTarget) || 5);
  // Penalty is ~80% of targets (rounded), minimum 5 each
  const penaltyQuiz = Math.max(5, Math.min(safeQuiz, Math.round(safeQuiz * 0.8)));
  const penaltyCloze = Math.max(5, Math.min(safeCloze, Math.round(safeCloze * 0.8)));
  return { penaltyQuiz, penaltyCloze };
}

export function getCustomPenaltyText(quizTarget: number, clozeTarget: number, lang: 'vi' | 'en' = 'vi'): string {
  const { penaltyQuiz, penaltyCloze } = getPenaltyRequirements(quizTarget, clozeTarget);
  if (lang === 'vi') {
    return `Khóa ứng dụng: Bắt buộc hoàn thành thêm ${penaltyQuiz} câu trắc nghiệm & ${penaltyCloze} câu đục lỗ ngữ cảnh để mở khóa! ⚡`;
  }
  return `Lockout Penalty: Must complete ${penaltyQuiz} Quiz & ${penaltyCloze} Cloze questions to unlock! ⚡`;
}

export function getSystemPenaltyText(diff: GoalDifficulty, lang: 'vi' | 'en' = 'vi'): string {
  const cfg = DIFFICULTY_CONFIGS[diff] || DIFFICULTY_CONFIGS.medium;
  return getCustomPenaltyText(cfg.quizTarget, cfg.clozeTarget, lang);
}

export const DEFAULT_REWARD = 'Tự thưởng 1 ly trà sữa / bữa ăn yêu thích 🧋';
export const DEFAULT_PENALTY = getSystemPenaltyText('medium', 'vi');

export const REWARD_SUGGESTIONS = [
  'Tự thưởng 1 ly trà sữa / cà phê yêu thích 🧋',
  'Thưởng 1 bữa lẩu / nướng tưng bừng cuối tuần 🍲',
  'Xem 1 bộ phim yêu thích cuối tuần không áy náy 🎬',
  'Tự mua 1 món đồ yêu thích trong danh sách mong muốn 🛍️',
  'Dành 2 tiếng chơi game / giải trí thả ga 🎮',
];

export interface WeeklyGoal {
  weekKey: string;     // e.g. "2026-W42"
  difficulty: GoalDifficulty; // 'easy' | 'medium' | 'hard' | 'nightmare'
  difficultyChosenForWeek: boolean; // whether user chose difficulty for this week
  // Specific targets per feature
  quizTarget: number;   // default from difficulty
  quizReviewed: number; // completed quiz items this week
  clozeTarget: number;  // default from difficulty
  clozeReviewed: number;// completed cloze items this week
  // Total summary
  targetWords: number;  // sum of targets
  reviewedCount: number;// total items completed
  // Reward & Penalty commitment contract
  rewardText: string;
  penaltyText: string;
  completedAt: string | null;
  celebratedAt?: string | null;
}

export interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string | null; // "YYYY-MM-DD"
  activeDatesThisWeek: string[]; // ["2026-10-19", "2026-10-21"]
}

let storageSyncCallback: (() => void) | null = null;

export function setStorageSyncCallback(cb: () => void) {
  storageSyncCallback = cb;
}

export interface ActivePenalty {
  isActive: boolean;
  reasonWeekKey: string;
  difficulty: GoalDifficulty;
  quizRequired: number;
  quizDone: number;
  clozeRequired: number;
  clozeDone: number;
  activatedAt: string;
  resolvedAt: string | null;
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

export function getActivePenalty(): ActivePenalty {
  try {
    const raw = localStorage.getItem(PENALTY_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          isActive: Boolean(parsed.isActive),
          reasonWeekKey: parsed.reasonWeekKey || '',
          difficulty: (parsed.difficulty in DIFFICULTY_CONFIGS ? parsed.difficulty : 'medium') as GoalDifficulty,
          quizRequired: Number(parsed.quizRequired) || 30,
          quizDone: Number(parsed.quizDone) || 0,
          clozeRequired: Number(parsed.clozeRequired) || 20,
          clozeDone: Number(parsed.clozeDone) || 0,
          activatedAt: parsed.activatedAt || new Date().toISOString(),
          resolvedAt: parsed.resolvedAt || null,
        };
      }
    }
  } catch {
    // fallback
  }
  return {
    isActive: false,
    reasonWeekKey: '',
    difficulty: 'medium',
    quizRequired: 0,
    quizDone: 0,
    clozeRequired: 0,
    clozeDone: 0,
    activatedAt: '',
    resolvedAt: null,
  };
}

export function saveActivePenalty(penalty: ActivePenalty, skipSync = false): void {
  try {
    localStorage.setItem(PENALTY_STATE_KEY, JSON.stringify(penalty));
    if (!skipSync) storageSyncCallback?.();
  } catch {
    // noop
  }
}

export function activatePenalty(difficulty?: GoalDifficulty, reasonWeekKey?: string): ActivePenalty {
  const goal = getWeeklyGoal();
  const diff = difficulty || goal.difficulty || calculateDifficulty(goal.quizTarget, goal.clozeTarget);
  const { penaltyQuiz, penaltyCloze } = getPenaltyRequirements(goal.quizTarget, goal.clozeTarget);
  const penalty: ActivePenalty = {
    isActive: true,
    reasonWeekKey: reasonWeekKey || goal.weekKey,
    difficulty: diff,
    quizRequired: penaltyQuiz,
    quizDone: 0,
    clozeRequired: penaltyCloze,
    clozeDone: 0,
    activatedAt: new Date().toISOString(),
    resolvedAt: null,
  };
  saveActivePenalty(penalty);
  return penalty;
}

export function clearActivePenalty(): void {
  const penalty = getActivePenalty();
  penalty.isActive = false;
  penalty.resolvedAt = new Date().toISOString();
  saveActivePenalty(penalty);
}

export function recordPenaltyActivity(
  type: 'quiz' | 'cloze',
  count = 1
): { penalty: ActivePenalty; justUnlocked: boolean } {
  const penalty = getActivePenalty();
  if (!penalty.isActive) return { penalty, justUnlocked: false };

  if (type === 'quiz') {
    penalty.quizDone = Math.min(penalty.quizRequired, penalty.quizDone + Math.max(1, count));
  } else if (type === 'cloze') {
    penalty.clozeDone = Math.min(penalty.clozeRequired, penalty.clozeDone + Math.max(1, count));
  }

  let justUnlocked = false;
  if (penalty.quizDone >= penalty.quizRequired && penalty.clozeDone >= penalty.clozeRequired) {
    penalty.isActive = false;
    penalty.resolvedAt = new Date().toISOString();
    justUnlocked = true;
  }

  saveActivePenalty(penalty);
  return { penalty, justUnlocked };
}

export function getWeeklyGoal(): WeeklyGoal {
  const currentWeek = getCurrentWeekKey();
  try {
    const raw = localStorage.getItem(WEEKLY_GOAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const difficulty = (parsed.difficulty in DIFFICULTY_CONFIGS ? parsed.difficulty : 'medium') as GoalDifficulty;
        const cfg = DIFFICULTY_CONFIGS[difficulty];
        const quizTarget = typeof parsed.quizTarget === 'number' ? parsed.quizTarget : cfg.quizTarget;
        const clozeTarget = typeof parsed.clozeTarget === 'number' ? parsed.clozeTarget : cfg.clozeTarget;
        const targetWords = typeof parsed.targetWords === 'number' ? parsed.targetWords : (quizTarget + clozeTarget);
        const rewardText = parsed.rewardText || DEFAULT_REWARD;
        const penaltyText = parsed.penaltyText || getSystemPenaltyText(difficulty);

        if (parsed.weekKey === currentWeek) {
          return {
            weekKey: currentWeek,
            difficulty,
            difficultyChosenForWeek: Boolean(parsed.difficultyChosenForWeek),
            quizTarget,
            quizReviewed: parsed.quizReviewed || 0,
            clozeTarget,
            clozeReviewed: parsed.clozeReviewed || 0,
            targetWords,
            reviewedCount: parsed.reviewedCount || 0,
            rewardText,
            penaltyText,
            completedAt: parsed.completedAt || null,
            celebratedAt: parsed.celebratedAt || null,
          };
        }

        // New week rollover detected!
        // Check if previous week was missed to trigger automatic penalty lockout
        const wasMissed = (parsed.quizReviewed || 0) < quizTarget || (parsed.clozeReviewed || 0) < clozeTarget;
        if (wasMissed) {
          activatePenalty(difficulty, parsed.weekKey);
        }

        // Rollover to new week, prompting for difficulty choice (Monday start)
        const newGoal: WeeklyGoal = {
          weekKey: currentWeek,
          difficulty,
          difficultyChosenForWeek: false,
          quizTarget: cfg.quizTarget,
          quizReviewed: 0,
          clozeTarget: cfg.clozeTarget,
          clozeReviewed: 0,
          targetWords: cfg.quizTarget + cfg.clozeTarget,
          reviewedCount: 0,
          rewardText,
          penaltyText: getSystemPenaltyText(difficulty),
          completedAt: null,
          celebratedAt: null,
        };
        saveWeeklyGoal(newGoal);
        return newGoal;
      }
    }
  } catch {
    // fallback
  }

  const defaultDiff: GoalDifficulty = 'medium';
  const defaultCfg = DIFFICULTY_CONFIGS[defaultDiff];
  const defaultGoal: WeeklyGoal = {
    weekKey: currentWeek,
    difficulty: defaultDiff,
    difficultyChosenForWeek: false,
    quizTarget: defaultCfg.quizTarget,
    quizReviewed: 0,
    clozeTarget: defaultCfg.clozeTarget,
    clozeReviewed: 0,
    targetWords: defaultCfg.quizTarget + defaultCfg.clozeTarget,
    reviewedCount: 0,
    rewardText: DEFAULT_REWARD,
    penaltyText: getSystemPenaltyText(defaultDiff),
    completedAt: null,
    celebratedAt: null,
  };
  saveWeeklyGoal(defaultGoal);
  return defaultGoal;
}

export function saveWeeklyGoal(goal: WeeklyGoal, skipSync = false): void {
  try {
    localStorage.setItem(WEEKLY_GOAL_KEY, JSON.stringify(goal));
    if (!skipSync) storageSyncCallback?.();
  } catch {
    // noop
  }
}

export function updateWeeklyGoal(
  params: Partial<Pick<WeeklyGoal, 'difficulty' | 'difficultyChosenForWeek' | 'quizTarget' | 'clozeTarget' | 'targetWords' | 'rewardText' | 'penaltyText'>>
): WeeklyGoal {
  const goal = getWeeklyGoal();
  if (params.difficulty !== undefined && params.difficulty in DIFFICULTY_CONFIGS) {
    goal.difficulty = params.difficulty;
  }
  if (params.difficultyChosenForWeek !== undefined) {
    goal.difficultyChosenForWeek = params.difficultyChosenForWeek;
  }
  if (params.quizTarget !== undefined) goal.quizTarget = Math.max(5, Math.round(params.quizTarget));
  if (params.clozeTarget !== undefined) goal.clozeTarget = Math.max(5, Math.round(params.clozeTarget));

  // If targets were updated without an explicit difficulty specified, auto-classify difficulty
  if (params.difficulty === undefined && (params.quizTarget !== undefined || params.clozeTarget !== undefined)) {
    goal.difficulty = calculateDifficulty(goal.quizTarget, goal.clozeTarget);
  }

  if (params.targetWords !== undefined) {
    goal.targetWords = Math.max(10, params.targetWords);
  } else {
    goal.targetWords = goal.quizTarget + goal.clozeTarget;
  }
  if (params.rewardText !== undefined) goal.rewardText = params.rewardText.trim() || DEFAULT_REWARD;
  if (params.penaltyText !== undefined) {
    goal.penaltyText = params.penaltyText.trim();
  } else if (params.quizTarget !== undefined || params.clozeTarget !== undefined || params.difficulty !== undefined) {
    goal.penaltyText = getCustomPenaltyText(goal.quizTarget, goal.clozeTarget);
  }

  const isAchieved = goal.quizReviewed >= goal.quizTarget && goal.clozeReviewed >= goal.clozeTarget;
  if (isAchieved && !goal.completedAt) {
    goal.completedAt = new Date().toISOString();
  } else if (!isAchieved && goal.completedAt) {
    goal.completedAt = null;
  }

  saveWeeklyGoal(goal);
  return goal;
}

export function setWeeklyDifficulty(difficulty: GoalDifficulty): WeeklyGoal {
  const cfg = DIFFICULTY_CONFIGS[difficulty] || DIFFICULTY_CONFIGS.medium;
  return updateWeeklyGoal({
    difficulty,
    difficultyChosenForWeek: true,
    quizTarget: cfg.quizTarget,
    clozeTarget: cfg.clozeTarget,
    penaltyText: getCustomPenaltyText(cfg.quizTarget, cfg.clozeTarget),
  });
}

export function setWeeklyCustomTargets(quizTarget: number, clozeTarget: number, rewardText?: string): WeeklyGoal {
  const diff = calculateDifficulty(quizTarget, clozeTarget);
  return updateWeeklyGoal({
    quizTarget,
    clozeTarget,
    difficulty: diff,
    difficultyChosenForWeek: true,
    ...(rewardText !== undefined ? { rewardText } : {}),
    penaltyText: getCustomPenaltyText(quizTarget, clozeTarget),
  });
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

export function saveStreakData(data: StreakData, skipSync = false): void {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(data));
    if (!skipSync) storageSyncCallback?.();
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

  if (justCompletedGoal && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vocabmaster_weekly_goal_completed', {
        detail: { goal, streak },
      })
    );
  }

  return { goal, streak, justCompletedGoal };
}

export function markWeeklyGoalCelebrated(): WeeklyGoal {
  const goal = getWeeklyGoal();
  goal.celebratedAt = new Date().toISOString();
  saveWeeklyGoal(goal);
  return goal;
}

export function triggerWeeklyCelebrationPopup(manual = false): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('vocabmaster_trigger_weekly_celebration', {
        detail: { manual, goal: getWeeklyGoal() },
      })
    );
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
  // Automatically increment weekly review count & streak with specific exercise type
  recordStudyActivity(1, record.type);

  // If a penalty lockout is currently active, credit progress towards resolving it
  if (record.type === 'quiz' || record.type === 'cloze') {
    recordPenaltyActivity(record.type, 1);
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
