// ── Activity feed ────────────────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  timestamp: string;
  actor: string;
  kind: "opened" | "merged" | "closed";
  prNumber: number;
  prTitle: string;
  prUrl: string;
}

export interface ActivityFeed {
  events: ActivityEvent[];
  etag: string | null;
}

type RawPREvent = {
  id: string;
  type: string;
  created_at: string;
  actor: { login: string };
  payload: {
    action: string;
    pull_request: {
      number: number;
      title: string;
      html_url: string;
      merged: boolean | null;
    };
  };
};

export function isBot(login: string): boolean {
  return login.endsWith("[bot]");
}

// GitHub REST returns max ~300 events total; 3 pages × 30 covers typical 7-day windows.
const MAX_ACTIVITY_PAGES = 3;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const EVENTS_REST_BASE = "https://api.github.com/repos";

async function fetchEventsPage(
  token: string,
  owner: string,
  name: string,
  page: number,
  etag?: string,
): Promise<{ status: number; events: RawPREvent[]; etag: string | null }> {
  const url = `${EVENTS_REST_BASE}/${owner}/${name}/events?per_page=30&page=${page}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (page === 1 && etag) {
    headers["If-None-Match"] = etag;
  }
  const res = await fetch(url, { headers });
  if (res.status === 304) {
    return { status: 304, events: [], etag: etag ?? null };
  }
  if (!res.ok) {
    throw new Error(`GitHub Events API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as RawPREvent[];
  return { status: res.status, events: data, etag: res.headers.get("etag") };
}

export async function fetchActivity(
  token: string,
  owner: string,
  name: string,
  opts?: { etag?: string; hideBots?: boolean },
): Promise<ActivityFeed> {
  const hideBots = opts?.hideBots !== false; // default true

  const page1 = await fetchEventsPage(token, owner, name, 1, opts?.etag);

  if (page1.status === 304) {
    // 304 Not Modified — caller keeps prior cached events. Empty events array signals "unchanged".
    return { events: [], etag: opts?.etag ?? null };
  }

  const cutoff = Date.now() - SEVEN_DAYS_MS;
  let allEvents = [...page1.events];
  const feedEtag = page1.etag;

  // Check if oldest event on page 1 is within window — if so, fetch more pages
  const oldestOnPage1 = page1.events[page1.events.length - 1];
  if (oldestOnPage1 && new Date(oldestOnPage1.created_at).getTime() >= cutoff) {
    for (let page = 2; page <= MAX_ACTIVITY_PAGES; page++) {
      const result = await fetchEventsPage(token, owner, name, page);
      if (result.events.length === 0) break;
      allEvents = allEvents.concat(result.events);
      const oldest = result.events[result.events.length - 1];
      if (!oldest || new Date(oldest.created_at).getTime() < cutoff) break;
    }
  }

  const events: ActivityEvent[] = allEvents
    .filter((e) => e.type === "PullRequestEvent")
    .filter((e) => new Date(e.created_at).getTime() >= cutoff)
    .filter((e) => !(hideBots && isBot(e.actor.login)))
    .flatMap((e): ActivityEvent[] => {
      const action = e.payload.action;
      const pr = e.payload.pull_request;
      let kind: ActivityEvent["kind"] | null = null;
      if (action === "opened" || action === "reopened") {
        kind = "opened";
      } else if (action === "closed") {
        kind = pr.merged === true ? "merged" : "closed";
      }
      if (kind === null) return [];
      return [
        {
          id: e.id,
          timestamp: e.created_at,
          actor: e.actor.login,
          kind,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.html_url,
        },
      ];
    })
    .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));

  return { events, etag: feedEtag };
}
