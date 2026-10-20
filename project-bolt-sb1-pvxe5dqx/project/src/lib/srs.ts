// Spaced Repetition System (SRS) using SuperMemo SM-2 algorithm

export interface SRSMetadata {
  interval: number; // in days
  easeFactor: number; // multiplier (default 2.5, min 1.3)
  dueDate: string; // ISO string
  repetition: number; // streak count
}

/**
 * Calculates next SRS interval, ease factor, repetition count and due date.
 * @param quality Review quality from 0 (complete blackout) to 5 (perfect recall)
 * @param currentInterval Current interval in days (default 1)
 * @param currentEaseFactor Current ease factor (default 2.5)
 * @param currentRepetition Current consecutive repetitions (default 0)
 */
export function calculateNextSRS(
  quality: number,
  currentInterval = 1,
  currentEaseFactor = 2.5,
  currentRepetition = 0
): SRSMetadata {
  // Clamp quality between 0 and 5
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  let interval = currentInterval;
  let repetition = currentRepetition;
  let easeFactor = currentEaseFactor;

  if (q >= 3) {
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetition++;
  } else {
    repetition = 0;
    interval = 1;
  }

  // SM-2 Ease Factor formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + interval);

  return {
    interval,
    easeFactor: Math.round(easeFactor * 100) / 100,
    dueDate: nextDue.toISOString(),
    repetition,
  };
}

/**
 * Checks whether a vocabulary item is due for review.
 */
export function isDueForReview(dueDate?: string): boolean {
  if (!dueDate) return true; // words without due date are due immediately
  const due = new Date(dueDate).getTime();
  const now = Date.now();
  return due <= now;
}

export type SRSStage = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface SRSStageInfo {
  stage: SRSStage;
  labelEn: string;
  labelVi: string;
  badgeClass: string;
}

/**
 * Categorizes a vocabulary into an SRS mastery stage.
 */
export function getSRSStage(interval = 1, repetition = 0): SRSStageInfo {
  if (repetition === 0) {
    return {
      stage: 'new',
      labelEn: 'New',
      labelVi: 'Mới học',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }
  if (interval < 6) {
    return {
      stage: 'learning',
      labelEn: 'Learning',
      labelVi: 'Đang ghi nhớ',
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
    };
  }
  if (interval < 21) {
    return {
      stage: 'reviewing',
      labelEn: 'Reviewing',
      labelVi: 'Ôn tập tốt',
      badgeClass: 'bg-sky-100 text-sky-700 border-sky-200',
    };
  }
  return {
    stage: 'mastered',
    labelEn: 'Mastered',
    labelVi: 'Thành thạo',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
}
