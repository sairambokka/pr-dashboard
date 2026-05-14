// ── Insights data clients ─────────────────────────────────────────────────────

const GQL_URL = "https://api.github.com/graphql";

// ── Period helper ─────────────────────────────────────────────────────────────

export type Period = "7d" | "30d" | "90d" | "1y" | "all";

export interface PeriodRange {
  since: string; // ISO date YYYY-MM-DD
  until: string; // ISO date YYYY-MM-DD (today)
  /** Empty string when period === "all"; check `days === 0` before computing delta. */
  previousSince: string;
  /** Empty string when period === "all". */
  previousUntil: string;
  days: number; // total window days, or 0 for ALL
}

function localISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function subtractDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() - n);
  return localISODate(d);
}

export function getPeriodRange(period: Period, repoCreatedAt: string): PeriodRange {
  const today = localISODate(new Date());

  if (period === "all") {
    const since = repoCreatedAt.slice(0, 10);
    return {
      since,
      until: today,
      previousSince: "",
      previousUntil: "",
      days: 0,
    };
  }

  const daysMap: Record<Exclude<Period, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "1y": 365,
  };
  const days = daysMap[period];
  const since = subtractDays(today, days);
  const previousUntil = since;
  const previousSince = subtractDays(since, days);

  return { since, until: today, previousSince, previousUntil, days };
}

// ── Shared GraphQL helper ─────────────────────────────────────────────────────

async function gqlSearch<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty GraphQL response");
  return json.data;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class StatsComputingError extends Error {
  constructor(message = "Stats still computing — GitHub will finish in a few minutes") {
    super(message);
    this.name = "StatsComputingError";
  }
}

// ── Insights PRs ─────────────────────────────────────────────────────────────

export interface InsightsPRSummary {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  author: string;
  firstCommitCiState: "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | null;
  reviewers: string[]; // distinct review authors (non-self, non-author)
}

const INSIGHTS_PRS_QUERY = `
query InsightsPRs($searchQ: String!, $cursor: String) {
  search(query: $searchQ, type: ISSUE, first: 100, after: $cursor) {
    issueCount
    pageInfo { endCursor hasNextPage }
    nodes {
      ... on PullRequest {
        number title url createdAt mergedAt closedAt
        author { login }
        commits(first: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
        reviews(first: 50) {
          nodes { author { login } state }
        }
      }
    }
  }
}`;

type GqlCiState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED";

type GqlInsightsPRNode = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  author: { login: string } | null;
  commits: {
    nodes: Array<{
      commit: { statusCheckRollup: { state: GqlCiState } | null };
    }>;
  };
  reviews: {
    nodes: Array<{ author: { login: string } | null; state: string }>;
  };
};

type GqlInsightsPRsResp = {
  search: {
    issueCount: number;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
    nodes: Array<GqlInsightsPRNode | Record<string, never>>;
  };
};

function parseInsightsPRNode(
  node: GqlInsightsPRNode,
  viewerLogin: string,
): InsightsPRSummary {
  const authorLogin = node.author?.login ?? "";
  const firstCommitCiState =
    node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;

  const reviewerSet = new Set<string>();
  for (const review of node.reviews.nodes) {
    const login = review.author?.login;
    if (!login) continue;
    if (login === authorLogin) continue;
    if (login === viewerLogin) continue;
    reviewerSet.add(login);
  }

  return {
    number: node.number,
    title: node.title,
    url: node.url,
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    closedAt: node.closedAt,
    author: authorLogin,
    firstCommitCiState,
    reviewers: Array.from(reviewerSet),
  };
}

export async function fetchInsightsPRs(
  token: string,
  owner: string,
  name: string,
  viewerLogin: string,
  range: PeriodRange,
): Promise<{ prs: InsightsPRSummary[]; hasMore: boolean }> {
  const repo = `repo:${owner}/${name}`;
  const author = `author:${viewerLogin}`;

  // Build date range qualifier — for "all" period use open-ended since
  const dateRange =
    range.days === 0
      ? `>=${range.since}`
      : `${range.since}..${range.until}`;

  const createdQ = `${repo} is:pr ${author} created:${dateRange}`;
  const mergedQ = `${repo} is:pr ${author} merged:${dateRange}`;

  const MAX_PAGES = 10;
  const prMap = new Map<number, InsightsPRSummary>();
  let hasMore = false;

  if (range.days === 0) {
    // For ALL period, paginate the created search only (up to MAX_PAGES * 100 PRs)
    let cursor: string | null = null;
    let pageHasNext = true;
    let pageCount = 0;
    while (pageHasNext && pageCount < MAX_PAGES) {
      const result = await fetchInsightsPRPage(token, createdQ, viewerLogin, cursor);
      for (const pr of result.prs) {
        prMap.set(pr.number, pr);
      }
      cursor = result.pageInfo.endCursor;
      pageHasNext = result.pageInfo.hasNextPage;
      pageCount++;
    }
    hasMore = pageHasNext;
  } else {
    // For bounded periods, run 2 searches (first 100 each) and union by PR number
    const [createdResult, mergedResult] = await Promise.all([
      fetchInsightsPRPage(token, createdQ, viewerLogin, null),
      fetchInsightsPRPage(token, mergedQ, viewerLogin, null),
    ]);
    for (const pr of [...createdResult.prs, ...mergedResult.prs]) {
      prMap.set(pr.number, pr);
    }
    if (createdResult.pageInfo.hasNextPage || mergedResult.pageInfo.hasNextPage) {
      hasMore = true;
    }
  }

  return { prs: Array.from(prMap.values()), hasMore };
}

async function fetchInsightsPRPage(
  token: string,
  searchQ: string,
  viewerLogin: string,
  cursor: string | null,
): Promise<{ prs: InsightsPRSummary[]; pageInfo: { endCursor: string | null; hasNextPage: boolean } }> {
  const data = await gqlSearch<GqlInsightsPRsResp>(token, INSIGHTS_PRS_QUERY, {
    searchQ,
    cursor: cursor ?? undefined,
  });
  const prs = data.search.nodes
    .filter((n): n is GqlInsightsPRNode => "number" in n)
    .map((n) => parseInsightsPRNode(n, viewerLogin));
  return { prs, pageInfo: data.search.pageInfo };
}

// ── Repo stats ────────────────────────────────────────────────────────────────

export interface RepoStats {
  openCount: number;
  oldestOpenDays: number | null;
  staleCount: number; // open PRs not updated in 7+ days, excluding drafts
}

const REPO_STATS_QUERY = `
query RepoStats($openQ: String!, $oldestQ: String!, $staleQ: String!) {
  open: search(query: $openQ, type: ISSUE, first: 0) { issueCount }
  oldest: search(query: $oldestQ, type: ISSUE, first: 1) {
    nodes { ... on PullRequest { createdAt } }
  }
  stale: search(query: $staleQ, type: ISSUE, first: 0) { issueCount }
}`;

type GqlRepoStatsResp = {
  open: { issueCount: number };
  oldest: { nodes: Array<{ createdAt?: string }> };
  stale: { issueCount: number };
};

export async function fetchRepoStats(
  token: string,
  owner: string,
  name: string,
): Promise<RepoStats> {
  const repo = `repo:${owner}/${name}`;
  const staleThreshold = localISODate(new Date(Date.now() - 7 * 86_400_000));

  const openQ = `${repo} is:pr is:open`;
  const oldestQ = `${repo} is:pr is:open sort:created-asc`;
  const staleQ = `${repo} is:pr is:open draft:false updated:<${staleThreshold}`;

  const data = await gqlSearch<GqlRepoStatsResp>(token, REPO_STATS_QUERY, {
    openQ,
    oldestQ,
    staleQ,
  });

  const openCount = data.open.issueCount;
  const staleCount = data.stale.issueCount;

  let oldestOpenDays: number | null = null;
  const oldestNode = data.oldest.nodes[0];
  if (oldestNode?.createdAt) {
    const nowMidnight = new Date(localISODate(new Date()) + "T00:00:00").getTime();
    const oldestMidnight = new Date(
      oldestNode.createdAt.slice(0, 10) + "T00:00:00",
    ).getTime();
    oldestOpenDays = Math.floor((nowMidnight - oldestMidnight) / 86_400_000);
  }

  return { openCount, oldestOpenDays, staleCount };
}

// ── Contributors (GraphQL) ────────────────────────────────────────────────────
//
// REST /stats/contributors blocks on a slow async job (202 first call). We
// instead use defaultBranchRef.history paginated, filtered by the viewer's
// user id. Synchronous. Typically 1-2 seconds.

export interface ContributorWeek {
  w: number; // week unix timestamp seconds (Sunday start)
  a: number; // additions
  d: number; // deletions
  c: number; // commits
}

export interface Contributor {
  login: string;
  total: number;
  weeks: ContributorWeek[];
}

interface GqlCommitNode {
  oid: string;
  committedDate: string;
  additions: number;
  deletions: number;
  author: { user: { login: string } | null } | null;
}

interface GqlHistory {
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
  nodes: GqlCommitNode[];
}

interface GqlHistoryResp {
  repository: {
    defaultBranchRef: {
      target: { history?: GqlHistory } | null;
    } | null;
  };
}

const HISTORY_QUERY = `
query Hist($owner: String!, $name: String!, $since: GitTimestamp, $author: ID, $cursor: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100, since: $since, author: { id: $author }, after: $cursor) {
            pageInfo { endCursor hasNextPage }
            nodes {
              oid
              committedDate
              additions
              deletions
              author { user { login } }
            }
          }
        }
      }
    }
  }
}`;

const HISTORY_NO_AUTHOR_QUERY = `
query Hist($owner: String!, $name: String!, $since: GitTimestamp, $cursor: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: 100, since: $since, after: $cursor) {
            pageInfo { endCursor hasNextPage }
            nodes {
              oid
              committedDate
              additions
              deletions
              author { user { login } }
            }
          }
        }
      }
    }
  }
}`;

function weekStartSeconds(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday start
  return Math.floor(d.getTime() / 1000);
}

async function fetchAllCommits(
  token: string,
  owner: string,
  name: string,
  since: string,
  authorId: string | null,
): Promise<GqlCommitNode[]> {
  const all: GqlCommitNode[] = [];
  let cursor: string | null = null;
  const maxPages = 20; // 2000 commits cap
  for (let i = 0; i < maxPages; i++) {
    const variables: Record<string, unknown> = { owner, name, since, cursor };
    if (authorId !== null) variables.author = authorId;
    const data: GqlHistoryResp = await gqlSearch<GqlHistoryResp>(
      token,
      authorId !== null ? HISTORY_QUERY : HISTORY_NO_AUTHOR_QUERY,
      variables,
    );
    const hist = data.repository.defaultBranchRef?.target?.history;
    if (!hist) break;
    all.push(...hist.nodes);
    if (!hist.pageInfo.hasNextPage) break;
    cursor = hist.pageInfo.endCursor;
  }
  return all;
}

/**
 * Fetch viewer's commit history (last 1 year cap). Returns single-element array
 * with bucketed weekly data. Shape matches legacy REST response so consumers
 * don't change.
 */
export async function fetchContributors(
  token: string,
  owner: string,
  name: string,
): Promise<Contributor[]> {
  // Resolve viewer + id in one call
  const viewerResp = await gqlSearch<{ viewer: { id: string; login: string } }>(
    token,
    `query { viewer { id login } }`,
    {},
  );
  const viewerId = viewerResp.viewer.id;
  const viewerLogin = viewerResp.viewer.login;

  // 1 year window
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const commits = await fetchAllCommits(token, owner, name, since, viewerId);

  const byWeek = new Map<number, ContributorWeek>();
  for (const c of commits) {
    const w = weekStartSeconds(c.committedDate);
    if (!byWeek.has(w)) byWeek.set(w, { w, a: 0, d: 0, c: 0 });
    const bucket = byWeek.get(w)!;
    bucket.a += c.additions;
    bucket.d += c.deletions;
    bucket.c += 1;
  }

  const weeks = Array.from(byWeek.values()).sort((a, b) => a.w - b.w);
  return [{ login: viewerLogin, total: commits.length, weeks }];
}

// ── Commit activity (GraphQL) ─────────────────────────────────────────────────

export interface CommitWeek {
  week: number; // unix seconds (Sunday start)
  days: number[]; // 7 daily counts (Sun..Sat)
  total: number;
}

export async function fetchCommitActivity(
  token: string,
  owner: string,
  name: string,
): Promise<CommitWeek[]> {
  // last 30 days
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const commits = await fetchAllCommits(token, owner, name, since, null);

  const byWeek = new Map<number, CommitWeek>();
  for (const c of commits) {
    const d = new Date(c.committedDate);
    const day = d.getDay(); // 0=Sun
    const wStart = weekStartSeconds(c.committedDate);
    if (!byWeek.has(wStart)) {
      byWeek.set(wStart, { week: wStart, days: [0, 0, 0, 0, 0, 0, 0], total: 0 });
    }
    const bucket = byWeek.get(wStart)!;
    bucket.days[day] += 1;
    bucket.total += 1;
  }

  return Array.from(byWeek.values()).sort((a, b) => a.week - b.week);
}

