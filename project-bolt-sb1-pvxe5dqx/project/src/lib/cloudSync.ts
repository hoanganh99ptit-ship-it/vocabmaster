import { supabase } from '@/lib/supabase';
import {
  getWeeklyGoal,
  saveWeeklyGoal,
  getActivePenalty,
  saveActivePenalty,
  getStreakData,
  saveStreakData,
  getCurrentWeekKey,
  setStorageSyncCallback,
  type WeeklyGoal,
  type ActivePenalty,
  type StreakData,
} from '@/lib/storage';
import type { User } from '@supabase/supabase-js';

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;
let isPushing = false;
let lastPushedPayload = '';

/**
 * Pushes the current local WeeklyGoal, ActivePenalty, and StreakData to Supabase user_metadata.
 * @param immediate If true, pushes immediately; otherwise debounced by 1000ms.
 */
export async function pushUserDataToCloud(immediate = false): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  const executePush = async () => {
    if (isPushing) return;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return;

      const goal = getWeeklyGoal();
      const penalty = getActivePenalty();
      const streak = getStreakData();

      const payload = JSON.stringify({ goal, penalty, streak });
      if (payload === lastPushedPayload) {
        return;
      }

      isPushing = true;
      await supabase.auth.updateUser({
        data: {
          weekly_goal: goal,
          active_penalty: penalty,
          streak_data: streak,
          last_synced_at: new Date().toISOString(),
        },
      });
      lastPushedPayload = payload;
    } catch (err) {
      // Silently fail if offline or network error
      console.warn('[cloudSync] Push failed:', err);
    } finally {
      isPushing = false;
    }
  };

  if (immediate) {
    await executePush();
  } else {
    pushTimer = setTimeout(executePush, 1000);
  }
}

/**
 * Syncs user data from Supabase user_metadata into localStorage.
 * Handles bidirectional merging so that a weekly goal selected on Machine A
 * automatically populates on Machine B without prompting to set it again.
 */
export async function syncUserDataWithCloud(currentUser?: User | null): Promise<boolean> {
  if (isSyncing) return false;
  isSyncing = true;

  try {
    let user = currentUser;
    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      isSyncing = false;
      return false;
    }

    const metadata = user.user_metadata || {};
    const remoteGoal = metadata.weekly_goal as WeeklyGoal | undefined;
    const remotePenalty = metadata.active_penalty as ActivePenalty | undefined;
    const remoteStreak = metadata.streak_data as StreakData | undefined;

    const localGoal = getWeeklyGoal();
    const currentWeek = getCurrentWeekKey();
    let pushNeeded = false;

    // --- 1. MERGE WEEKLY GOAL ---
    if (remoteGoal && remoteGoal.weekKey === currentWeek) {
      if (remoteGoal.difficultyChosenForWeek && !localGoal.difficultyChosenForWeek) {
        // Machine B: Remote has chosen goal, local has not chosen yet
        const mergedGoal: WeeklyGoal = {
          ...remoteGoal,
          quizReviewed: Math.max(localGoal.quizReviewed || 0, remoteGoal.quizReviewed || 0),
          clozeReviewed: Math.max(localGoal.clozeReviewed || 0, remoteGoal.clozeReviewed || 0),
          reviewedCount: Math.max(localGoal.reviewedCount || 0, remoteGoal.reviewedCount || 0),
          celebratedAt: remoteGoal.celebratedAt || localGoal.celebratedAt || null,
        };
        saveWeeklyGoal(mergedGoal, true);
        if (mergedGoal.quizReviewed > remoteGoal.quizReviewed || mergedGoal.clozeReviewed > remoteGoal.clozeReviewed) {
          pushNeeded = true;
        }
      } else if (!remoteGoal.difficultyChosenForWeek && localGoal.difficultyChosenForWeek) {
        // Local has chosen goal, remote has not
        pushNeeded = true;
      } else if (remoteGoal.difficultyChosenForWeek && localGoal.difficultyChosenForWeek) {
        // Both machines have chosen a goal; merge review progress and timestamps
        const mergedGoal: WeeklyGoal = {
          ...remoteGoal,
          quizReviewed: Math.max(localGoal.quizReviewed || 0, remoteGoal.quizReviewed || 0),
          clozeReviewed: Math.max(localGoal.clozeReviewed || 0, remoteGoal.clozeReviewed || 0),
          reviewedCount: Math.max(localGoal.reviewedCount || 0, remoteGoal.reviewedCount || 0),
          completedAt: remoteGoal.completedAt || localGoal.completedAt,
          celebratedAt: remoteGoal.celebratedAt || localGoal.celebratedAt || null,
        };
        saveWeeklyGoal(mergedGoal, true);
        if (
          mergedGoal.quizReviewed > (remoteGoal.quizReviewed || 0) ||
          mergedGoal.clozeReviewed > (remoteGoal.clozeReviewed || 0)
        ) {
          pushNeeded = true;
        }
      }
    } else if (localGoal.difficultyChosenForWeek && localGoal.weekKey === currentWeek) {
      // Local has a valid chosen goal for current week, but cloud doesn't have it yet
      pushNeeded = true;
    }

    // --- 2. MERGE ACTIVE PENALTY ---
    const localPenalty = getActivePenalty();
    if (remotePenalty && remotePenalty.reasonWeekKey === currentWeek) {
      if (remotePenalty.isActive && !localPenalty.isActive) {
        saveActivePenalty(remotePenalty, true);
      } else if (remotePenalty.isActive && localPenalty.isActive) {
        const mergedPenalty: ActivePenalty = {
          ...remotePenalty,
          quizDone: Math.max(localPenalty.quizDone || 0, remotePenalty.quizDone || 0),
          clozeDone: Math.max(localPenalty.clozeDone || 0, remotePenalty.clozeDone || 0),
        };
        if (mergedPenalty.quizDone >= mergedPenalty.quizRequired && mergedPenalty.clozeDone >= mergedPenalty.clozeRequired) {
          mergedPenalty.isActive = false;
          mergedPenalty.resolvedAt = new Date().toISOString();
        }
        saveActivePenalty(mergedPenalty, true);
        if (mergedPenalty.quizDone > remotePenalty.quizDone || mergedPenalty.clozeDone > remotePenalty.clozeDone) {
          pushNeeded = true;
        }
      } else if (!remotePenalty.isActive && localPenalty.isActive && remotePenalty.resolvedAt) {
        // Resolved on remote, resolve locally
        saveActivePenalty(remotePenalty, true);
      }
    } else if (localPenalty.isActive) {
      pushNeeded = true;
    }

    // --- 3. MERGE STREAK DATA ---
    const localStreak = getStreakData();
    if (remoteStreak) {
      const mergedDates = Array.from(
        new Set([...(localStreak.activeDatesThisWeek || []), ...(remoteStreak.activeDatesThisWeek || [])])
      ).sort();

      const mergedStreak: StreakData = {
        bestStreak: Math.max(localStreak.bestStreak || 0, remoteStreak.bestStreak || 0),
        currentStreak: Math.max(localStreak.currentStreak || 0, remoteStreak.currentStreak || 0),
        lastActiveDate:
          (localStreak.lastActiveDate || '') > (remoteStreak.lastActiveDate || '')
            ? localStreak.lastActiveDate
            : remoteStreak.lastActiveDate || localStreak.lastActiveDate,
        activeDatesThisWeek: mergedDates.slice(-7),
      };

      saveStreakData(mergedStreak, true);
      if (
        mergedStreak.currentStreak > (remoteStreak.currentStreak || 0) ||
        mergedStreak.bestStreak > (remoteStreak.bestStreak || 0) ||
        mergedDates.length > (remoteStreak.activeDatesThisWeek?.length || 0)
      ) {
        pushNeeded = true;
      }
    } else if (localStreak.currentStreak > 0) {
      pushNeeded = true;
    }

    if (pushNeeded) {
      await pushUserDataToCloud(true);
    } else {
      // Data is already in sync with remote, memorize payload to avoid spurious pushes
      lastPushedPayload = JSON.stringify({
        goal: getWeeklyGoal(),
        penalty: getActivePenalty(),
        streak: getStreakData(),
      });
    }

    // Dispatch event so UI instantly rerenders
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vocabmaster_sync_completed', {
          detail: {
            goal: getWeeklyGoal(),
            penalty: getActivePenalty(),
            streak: getStreakData(),
          },
        })
      );
    }

    return true;
  } catch (err) {
    console.warn('[cloudSync] Sync error:', err);
    return false;
  } finally {
    isSyncing = false;
  }
}

// Automatically register auto-push on any local storage modifications
setStorageSyncCallback(() => {
  pushUserDataToCloud(false);
});
