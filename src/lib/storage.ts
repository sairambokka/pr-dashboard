export interface Settings {
  token: string;
  owner: string;
  repo: string;
  intervalSec: number;
}

const KEY = "pr-dashboard.settings";
const SEEN_KEY = "pr-dashboard.seen";

const DEFAULT: Settings = {
  token: "",
  owner: "",
  repo: "",
  intervalSec: 60,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT;
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

import type { CiState } from "./github";

export interface SeenEntry {
  totalComments: number;
  latestReviewSubmittedAt: string | null;
  ciState: CiState | null;
  snoozedUntil?: number;
}

export type SeenMap = Record<number, SeenEntry>;

export function loadSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<number, number | SeenEntry>;
    const out: SeenMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number") {
        out[Number(k)] = { totalComments: v, latestReviewSubmittedAt: null, ciState: null };
      } else {
        out[Number(k)] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSeen(seen: SeenMap): void {
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}
