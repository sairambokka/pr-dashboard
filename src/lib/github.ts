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

export type ReviewState = "PENDING" | "COMMENTED" | "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED";
export type CiState = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED";

export interface PRSummary {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
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

interface GqlResp {
  data?: {
    viewer: { login: string; name: string | null; avatarUrl: string };
    repository: {
      pullRequests: {
        nodes: Array<{
          number: number;
          title: string;
          url: string;
          isDraft: boolean;
          updatedAt: string;
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
              requestedReviewer: { login?: string; name?: string; slug?: string } | null;
            }>;
          };
          timelineItems: {
            nodes: Array<{
              createdAt?: string;
              requestedReviewer?: { login?: string; name?: string; slug?: string } | null;
            }>;
          };
        }>;
      };
    };
  };
  errors?: Array<{ message: string }>;
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
    .map<PRSummary>((p) => {
      const reviewCommentCount = p.reviewThreads.nodes.reduce(
        (sum, t) => sum + t.comments.totalCount,
        0,
      );
      const issueCommentCount = p.comments.totalCount;
      const ci = p.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;

      const latestByAuthor = new Map<string, { state: ReviewState; at: string }>();
      let latestReviewSubmittedAt: string | null = null;
      for (const r of p.reviews.nodes) {
        const author = r.author?.login;
        if (!author) continue;
        if (author === login) continue;
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
      if (p.reviewDecision === "CHANGES_REQUESTED" || changeRequesters.length > 0) {
        effective = "CHANGES_REQUESTED";
      } else if (p.reviewDecision === "APPROVED" || approvers.length > 0) {
        effective = "APPROVED";
      }

      const reviewRequestedReviewers = p.reviewRequests.nodes
        .map((r) => r.requestedReviewer)
        .filter((r): r is NonNullable<typeof r> => r != null)
        .map((r) =>
          r.login
            ? { kind: "user" as const, name: r.login }
            : { kind: "team" as const, name: r.name ?? r.slug ?? "" },
        );

      const reviewRequestedTimes = p.timelineItems.nodes
        .filter((n) => n.createdAt != null)
        .map((n) => ({
          createdAt: n.createdAt as string,
          reviewerLogin: n.requestedReviewer?.login ?? null,
          teamSlug: n.requestedReviewer?.slug ?? null,
        }));

      return {
        number: p.number,
        title: p.title,
        url: p.url,
        isDraft: p.isDraft,
        updatedAt: p.updatedAt,
        headRefName: p.headRefName,
        baseRefName: p.baseRefName,
        issueCommentCount,
        reviewCommentCount,
        totalCommentCount: issueCommentCount + reviewCommentCount,
        reviewDecision: p.reviewDecision,
        effectiveReview: effective,
        approvers,
        changeRequesters,
        ciState: ci,
        latestReviewSubmittedAt,
        reviewRequestedReviewers,
        reviewRequestedTimes,
      };
    });
  return { viewer, prs };
}
