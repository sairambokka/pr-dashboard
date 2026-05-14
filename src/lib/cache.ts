interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { fetchedAt: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function cacheFetchedAt(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<unknown> = JSON.parse(raw);
    return entry.fetchedAt;
  } catch {
    return null;
  }
}

export async function withDailyCache<T>(
  key: string,
  maxAgeMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = readCache<T>(key, maxAgeMs);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  writeCache(key, fresh);
  return fresh;
}
