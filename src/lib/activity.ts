// ── Activity feed ────────────────────────────────────────────────────────────
//
// Sourced from GitHub GraphQL search (not REST /events). REST events cap at
// ~90 events total for a repo and are dominated by pushes / comments / CI
// runs — leaving very few PR-shaped events after filtering. GraphQL search
// returns PRs directly, scoped by date.

const GQL_URL = "https://api.github.com/graphql";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
  etag: string | null; // kept for cache-key compat with ActivityPanel
}

export function isBot(login: string): boolean {
  return login.endsWith("[bot]");
}

interface GqlActor {
  login: string;
}

interface GqlPRNode {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  state: "OPEN" | "CLOSED" | "MERGED";
  author: GqlActor | null;
  mergedBy: GqlActor | null;
}

interface GqlSearchResp {
  data?: {
    createdSearch: { nodes: GqlPRNode[] };
    closedSearch: { nodes: GqlPRNode[] };
  };
  errors?: Array<{ message: string }>;
}

const ACTIVITY_QUERY = `
query Activity($createdQ: String!, $closedQ: String!) {
  createdSearch: search(query: $createdQ, type: ISSUE, first: 100) {
    nodes {
      ... on PullRequest {
        number title url createdAt closedAt mergedAt state
        author { login }
        mergedBy { login }
      }
    }
  }
  closedSearch: search(query: $closedQ, type: ISSUE, first: 100) {
    nodes {
      ... on PullRequest {
        number title url createdAt closedAt mergedAt state
        author { login }
        mergedBy { login }
      }
    }
  }
}`;

export async function fetchActivity(
  token: string,
  owner: string,
  name: string,
  opts?: { etag?: string; hideBots?: boolean },
): Promise<ActivityFeed> {
  const hideBots = opts?.hideBots !== false; // default true
  const sinceIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString().slice(0, 10);

  const createdQ = `is:pr repo:${owner}/${name} created:>=${sinceIso}`;
  const closedQ = `is:pr repo:${owner}/${name} closed:>=${sinceIso}`;

  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: ACTIVITY_QUERY, variables: { createdQ, closedQ } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  }
  const json: GqlSearchResp = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty GraphQL response");

  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const seen = new Map<string, ActivityEvent>(); // id -> event (de-dup by composite key)

  const push = (ev: ActivityEvent) => {
    if (hideBots && isBot(ev.actor)) return;
    seen.set(ev.id, ev);
  };

  for (const pr of json.data.createdSearch.nodes) {
    if (!pr.number) continue; // empty union match
    const t = new Date(pr.createdAt).getTime();
    if (t < cutoff) continue;
    push({
      id: `${pr.number}-opened`,
      timestamp: pr.createdAt,
      actor: pr.author?.login ?? "unknown",
      kind: "opened",
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.url,
    });
  }

  for (const pr of json.data.closedSearch.nodes) {
    if (!pr.number) continue;
    if (pr.mergedAt) {
      const t = new Date(pr.mergedAt).getTime();
      if (t >= cutoff) {
        push({
          id: `${pr.number}-merged`,
          timestamp: pr.mergedAt,
          actor: pr.mergedBy?.login ?? pr.author?.login ?? "unknown",
          kind: "merged",
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.url,
        });
      }
    } else if (pr.closedAt) {
      const t = new Date(pr.closedAt).getTime();
      if (t >= cutoff) {
        push({
          id: `${pr.number}-closed`,
          timestamp: pr.closedAt,
          actor: pr.author?.login ?? "unknown",
          kind: "closed",
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.url,
        });
      }
    }
  }

  const events = Array.from(seen.values()).sort((a, b) =>
    a.timestamp > b.timestamp ? -1 : 1,
  );

  return { events, etag: null };
}
