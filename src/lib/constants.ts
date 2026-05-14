/** Poll intervals (milliseconds) */
export const POLL_DEFAULT_SEC = 60;
export const POLL_HIDDEN_MS = 5 * 60_000; // 5 min when tab hidden
export const POLL_INSIGHTS_MS = 5 * 60_000; // Insights always 5 min
export const POLL_LINEAR_MS = 5 * 60_000; // Linear always 5 min
export const POLL_TURNAROUND_MS = 10 * 60_000; // Turnaround 10 min
export const POLL_HOURLY_MS = 60 * 60_000; // Repo stats hourly

/** Blocking thresholds (days) */
export const BLOCKING_THRESHOLD_DAYS = 3;
export const OLDEST_DANGER_DAYS = 5;
export const STALE_PR_THRESHOLD_DAYS = 7;

/** UI display caps */
export const MAX_BUBBLE_DISPLAY = 99; // shows "99+"
export const MAX_ALL_PERIOD_PRS = 1000;

/** Activity tab */
export const ACTIVITY_WINDOW_DAYS = 7;
