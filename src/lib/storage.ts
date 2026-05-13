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

export type SeenMap = Record<number, number>;

export function loadSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SeenMap;
  } catch {
    return {};
  }
}

export function saveSeen(seen: SeenMap): void {
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}
