// ── Insights data clients ─────────────────────────────────────────────────────

const GQL_URL = "https://api.github.com/graphql";
const REST_BASE = "https://api.github.com";

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

// ── Shared REST retry helper ──────────────────────────────────────────────────

async function restGetWithRetry<T>(url: string, token: string): Promise<T> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(url, { headers });

    if (res.status === 202) {
      if (attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        continue;
      }
      throw new Error("Contributors stats still computing — try again later");
    }

    if (!res.ok) {
      throw new Error(`GitHub REST ${res.status}: ${await res.text()}`);
    }

    return (await res.json()) as T;
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Contributors stats still computing — try again later");
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

// ── Contributors (REST) ───────────────────────────────────────────────────────

export interface ContributorWeek {
  w: number; // week unix timestamp seconds
  a: number; // additions
  d: number; // deletions
  c: number; // commits
}

export interface Contributor {
  login: string;
  total: number; // total commits
  weeks: ContributorWeek[];
}

type RawContributor = {
  author: { login: string };
  total: number;
  weeks: ContributorWeek[];
};

export async function fetchContributors(
  token: string,
  owner: string,
  name: string,
): Promise<Contributor[]> {
  const url = `${REST_BASE}/repos/${owner}/${name}/stats/contributors`;
  const raw = await restGetWithRetry<RawContributor[]>(url, token);
  return raw.map((c) => ({ login: c.author.login, total: c.total, weeks: c.weeks }));
}

// ── Commit activity (REST) ────────────────────────────────────────────────────

export interface CommitWeek {
  week: number; // unix seconds
  days: number[]; // 7 daily counts
  total: number;
}

export async function fetchCommitActivity(
  token: string,
  owner: string,
  name: string,
): Promise<CommitWeek[]> {
  const url = `${REST_BASE}/repos/${owner}/${name}/stats/commit_activity`;
  return restGetWithRetry<CommitWeek[]>(url, token);
}

