export const EFFORT_WEIGHTS = {
  light: 1,
  medium: 2,
  heavy: 3,
} as const

export const MAX_TASKS_PER_DAY = 5
export const MAX_CARRYOVER_TASKS = 2
export const MAX_GOALS_PER_MONTH = 5
export const MAX_BUSINESS_GOALS = 3
export const CARRY_FLAG_THRESHOLD = 3
export const LOW_SCORE_THRESHOLD = 0.4
export const LOW_SCORE_STREAK_DAYS = 3
export const OUTREACH_SKIP_DAYS = 5
export const NOTIFICATION_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
