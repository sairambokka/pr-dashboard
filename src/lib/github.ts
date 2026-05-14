const GQL_URL = "https://api.github.com/graphql";

const QUERY = `
query($owner: String!, $name: String!) {
  viewer { login name avatarUrl(size: 88) }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        url
        isDraft
        updatedAt
        createdAt
        author { login }
        headRefName
        baseRefName
        comments { totalCount }
        reviewThreads(first: 100) { nodes { comments { totalCount } } }
        reviewDecision
        reviews(last: 30) {
          nodes { state author { login } submittedAt }
        }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup { state }
            }
          }
        }
        reviewRequests(first: 10) {
          nodes {
            requestedReviewer {
              ... on User { login }
              ... on Team { name slug }
            }
          }
        }
        timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT]) {
          nodes {
            ... on ReviewRequestedEvent {
              createdAt
              requestedReviewer {
                ... on User { login }
                ... on Team { name slug }
              }
            }
          }
        }
      }
    }
  }
}`;

const AWAITING_QUERY = `
query AwaitingReview($searchQ: String!) {
  search(query: $searchQ, type: ISSUE, first: 50) {
    issueCount
    nodes {
      ... on PullRequest {
        number title url isDraft updatedAt createdAt
        author { login }
        headRefName baseRefName
        comments { totalCount }
        reviewThreads(first: 100) { nodes { comments { totalCount } } }
        reviewDecision
        reviews(last: 30) { nodes { state author { login } submittedAt } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        reviewRequests(first: 10) {
          nodes { requestedReviewer { ... on User { login } ... on Team { name slug } } }
        }
        timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT]) {
          nodes { ... on ReviewRequestedEvent {
            createdAt
            requestedReviewer { ... on User { login } ... on Team { name slug } }
          } }
        }
      }
    }
  }
}`;

export type ReviewState = "PENDING" | "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED";
export type CiState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED";

export interface PRSummary {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  createdAt: string;
  headRefName: string;
  baseRefName: string;
  issueCommentCount: number;
  reviewCommentCount: number;
  totalCommentCount: number;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  effectiveReview: "APPROVED" | "CHANGES_REQUESTED" | null;
  approvers: string[];
  changeRequesters: string[];
  ciState: CiState | null;
  latestReviewSubmittedAt: string | null;
  reviewRequestedReviewers: Array<{ kind: "user" | "team"; name: string }>;
  reviewRequestedTimes: Array<{ createdAt: string; reviewerLogin: string | null; teamSlug: string | null }>;
}

export interface AwaitingReviewPR extends PRSummary {
  blockingSinceAt: string | null;
  blockingDays: number | null;
  isTeamRequest: boolean; // true when only team-requested; blockingDays may be inaccurate
}

type GqlRequestedReviewer = { login: string } | { name: string; slug: string } | null;

type GqlPRNode = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  createdAt: string;
  author: { login: string } | null;
  headRefName: string;
  baseRefName: string;
  comments: { totalCount: number };
  reviewThreads: { nodes: Array<{ comments: { totalCount: number } }> };
  reviewDecision: PRSummary["reviewDecision"];
  reviews: {
    nodes: Array<{
      state: ReviewState;
      author: { login: string } | null;
      submittedAt: string | null;
    }>;
  };
  commits: {
    nodes: Array<{
      commit: { statusCheckRollup: { state: PRSummary["ciState"] } | null };
    }>;
  };
  reviewRequests: {
    nodes: Array<{
      requestedReviewer: GqlRequestedReviewer;
    }>;
  };
  timelineItems: {
    nodes: Array<{
      createdAt?: string;
      requestedReviewer?: GqlRequestedReviewer;
    }>;
  };
};

interface GqlResp {
  data?: {
    viewer: { login: string; name: string | null; avatarUrl: string };
    repository: {
      pullRequests: {
        nodes: GqlPRNode[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

interface GqlAwaitingResp {
  data?: {
    search: {
      issueCount: number;
      nodes: Array<GqlPRNode | Record<string, never>>;
    };
  };
  errors?: Array<{ message: string }>;
}

function parsePullRequestNode(node: GqlPRNode, viewerLogin: string): PRSummary {
  const reviewCommentCount = node.reviewThreads.nodes.reduce(
    (sum, t) => sum + t.comments.totalCount,
    0,
  );
  const issueCommentCount = node.comments.totalCount;
  const ci = node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;

  const latestByAuthor = new Map<string, { state: ReviewState; at: string }>();
  let latestReviewSubmittedAt: string | null = null;
  for (const r of node.reviews.nodes) {
    const author = r.author?.login;
    if (!author) continue;
    if (author === viewerLogin) continue;
    if (r.state === "COMMENTED" || r.state === "PENDING") continue;
    const at = r.submittedAt ?? "";
    if (!at) continue;
    if (!latestReviewSubmittedAt || at > latestReviewSubmittedAt) {
      latestReviewSubmittedAt = at;
    }
    const existing = latestByAuthor.get(author);
    if (!existing || at > existing.at) {
      latestByAuthor.set(author, { state: r.state, at });
    }
  }
  const approvers: string[] = [];
  const changeRequesters: string[] = [];
  for (const [author, { state }] of latestByAuthor) {
    if (state === "APPROVED") approvers.push(author);
    else if (state === "CHANGES_REQUESTED") changeRequesters.push(author);
  }
  let effective: PRSummary["effectiveReview"] = null;
  if (node.reviewDecision === "CHANGES_REQUESTED" || changeRequesters.length > 0) {
    effective = "CHANGES_REQUESTED";
  } else if (node.reviewDecision === "APPROVED" || approvers.length > 0) {
    effective = "APPROVED";
  }

  const reviewRequestedReviewers = node.reviewRequests.nodes
    .map((r) => r.requestedReviewer)
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map((r) =>
      "login" in r
        ? { kind: "user" as const, name: r.login }
        : { kind: "team" as const, name: r.name },
    );

  // inline fragment: nodes outside REVIEW_REQUESTED_EVENT come back as empty objects
  const reviewRequestedTimes = node.timelineItems.nodes
    .filter((n): n is Required<typeof n> => "createdAt" in n)
    .map((n) => ({
      createdAt: n.createdAt,
      reviewerLogin:
        n.requestedReviewer != null && "login" in n.requestedReviewer
          ? n.requestedReviewer.login
          : null,
      teamSlug:
        n.requestedReviewer != null && "slug" in n.requestedReviewer
          ? n.requestedReviewer.slug
          : null,
    }));

  return {
    number: node.number,
    title: node.title,
    url: node.url,
    isDraft: node.isDraft,
    updatedAt: node.updatedAt,
    createdAt: node.createdAt,
    headRefName: node.headRefName,
    baseRefName: node.baseRefName,
    issueCommentCount,
    reviewCommentCount,
    totalCommentCount: issueCommentCount + reviewCommentCount,
    reviewDecision: node.reviewDecision,
    effectiveReview: effective,
    approvers,
    changeRequesters,
    ciState: ci,
    latestReviewSubmittedAt,
    reviewRequestedReviewers,
    reviewRequestedTimes,
  };
}

export async function fetchMyPRs(
  token: string,
  owner: string,
  name: string,
): Promise<{ viewer: { login: string; name: string | null; avatarUrl: string }; prs: PRSummary[] }> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { owner, name } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const json: GqlResp = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty GraphQL response");

  const viewer = json.data.viewer;
  const login = viewer.login;
  const prs = json.data.repository.pullRequests.nodes
    .filter((p) => p.author?.login === login)
    .map((p) => parsePullRequestNode(p, login));

  return { viewer, prs };
}

const TURNAROUND_QUERY = `
query Turnaround($searchQ: String!) {
  search(query: $searchQ, type: ISSUE, first: 50) {
    nodes {
      ... on PullRequest {
        number createdAt closedAt mergedAt
        author { login }
        timelineItems(first: 100, itemTypes: [REVIEW_REQUESTED_EVENT, PULL_REQUEST_REVIEW]) {
          nodes {
            __typename
            ... on ReviewRequestedEvent {
              createdAt
              requestedReviewer { ... on User { login } ... on Team { name slug } }
            }
            ... on PullRequestReview {
              submittedAt
              author { login }
              state
            }
          }
        }
      }
    }
  }
}`;

export interface TurnaroundStat {
  avgDays: number | null;
  sampleSize: number;
}

type GqlTurnaroundTimelineNode =
  | {
      __typename: "ReviewRequestedEvent";
      createdAt: string;
      requestedReviewer: GqlRequestedReviewer;
    }
  | {
      __typename: "PullRequestReview";
      submittedAt: string | null;
      author: { login: string } | null;
      state: ReviewState;
    };

type GqlTurnaroundPRNode = {
  number: number;
  createdAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  author: { login: string } | null;
  timelineItems: { nodes: GqlTurnaroundTimelineNode[] };
};

interface GqlTurnaroundResp {
  data?: {
    search: {
      nodes: Array<GqlTurnaroundPRNode | Record<string, never>>;
    };
  };
  errors?: Array<{ message: string }>;
}

export async function fetchTurnaround(
  token: string,
  owner: string,
  name: string,
): Promise<TurnaroundStat> {
  const iso = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const searchQ = `is:pr is:closed repo:${owner}/${name} closed:>=${iso}`;
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: TURNAROUND_QUERY, variables: { searchQ } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const json: GqlTurnaroundResp = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty GraphQL response");

  const deltas: number[] = [];

  for (const node of json.data.search.nodes) {
    if (!("number" in node)) continue;
    const pr = node as GqlTurnaroundPRNode;
    const prAuthorLogin = pr.author?.login ?? null;

    const requestEvents: Array<{ createdAt: string; reviewerLogin: string }> = [];
    const reviewEvents: Array<{ submittedAt: string; authorLogin: string }> = [];

    for (const item of pr.timelineItems.nodes) {
      if (item.__typename === "ReviewRequestedEvent") {
        if (item.requestedReviewer != null && "login" in item.requestedReviewer) {
          requestEvents.push({
            createdAt: item.createdAt,
            reviewerLogin: item.requestedReviewer.login,
          });
        }
        // skip team reviewers for this metric
      } else if (item.__typename === "PullRequestReview") {
        const authorLogin = item.author?.login ?? null;
        if (!authorLogin) continue;
        if (!item.submittedAt) continue;
        // exclude self-reviews
        if (authorLogin === prAuthorLogin) continue;
        // only substantive reviews
        if (item.state === "PENDING" || item.state === "COMMENTED") continue;
        reviewEvents.push({ submittedAt: item.submittedAt, authorLogin });
      }
    }

    for (const req of requestEvents) {
      const reqTime = new Date(req.createdAt).getTime();
      // Find earliest subsequent review by a different author (not the requester)
      let earliest: number | null = null;
      for (const rev of reviewEvents) {
        const revTime = new Date(rev.submittedAt).getTime();
        if (revTime < reqTime) continue;
        if (earliest === null || revTime < earliest) {
          earliest = revTime;
        }
      }
      if (earliest !== null) {
        deltas.push((earliest - reqTime) / 86_400_000);
      }
    }
  }

  if (deltas.length === 0) {
    return { avgDays: null, sampleSize: 0 };
  }

  const sum = deltas.reduce((a, b) => a + b, 0);
  const avgDays = Math.round((sum / deltas.length) * 10) / 10;
  return { avgDays, sampleSize: deltas.length };
}

export async function fetchAwaitingReview(
  token: string,
  owner: string,
  name: string,
  viewerLogin: string,
): Promise<AwaitingReviewPR[]> {
  const searchQ = `is:pr is:open review-requested:@me repo:${owner}/${name}`;
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: AWAITING_QUERY, variables: { searchQ } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const json: GqlAwaitingResp = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty GraphQL response");

  const now = Date.now();

  return json.data.search.nodes
    .filter((node): node is GqlPRNode => "number" in node)
    .map((node) => {
      const summary = parsePullRequestNode(node, viewerLogin);

      // Find the latest review-request event for this viewer (individual, not team)
      const viewerRequestTimes = summary.reviewRequestedTimes
        .filter((t) => t.reviewerLogin === viewerLogin)
        .map((t) => t.createdAt);

      const isTeamRequest =
        viewerRequestTimes.length === 0 &&
        summary.reviewRequestedReviewers.some((r) => r.kind === "team");

      let blockingSinceAt: string | null = null;
      if (viewerRequestTimes.length > 0) {
        blockingSinceAt = viewerRequestTimes.reduce((max, t) => (t > max ? t : max));
      } else {
        // Team-via-mention review requests aren't captured by individual-login timeline filtering.
        // Falls back to PR createdAt — may overcount blocking days for team-only requests.
        blockingSinceAt = node.createdAt;
      }

      const blockingDays =
        blockingSinceAt !== null
          ? Math.floor((now - new Date(blockingSinceAt).getTime()) / 86_400_000)
          : null;

      return { ...summary, blockingSinceAt, blockingDays, isTeamRequest };
    });
}
