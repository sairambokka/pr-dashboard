const GQL_URL = "https://api.github.com/graphql";

const QUERY = `
query($owner: String!, $name: String!, $login: String!) {
  viewer { login }
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
        reviews(last: 20) { nodes { state author { login } submittedAt } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup { state }
            }
          }
        }
      }
    }
  }
}`;

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
  ciState: "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | null;
}

interface GqlResp {
  data?: {
    viewer: { login: string };
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
          commits: {
            nodes: Array<{
              commit: { statusCheckRollup: { state: PRSummary["ciState"] } | null };
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
): Promise<{ login: string; prs: PRSummary[] }> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { owner, name, login: "" } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const json: GqlResp = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty GraphQL response");

  const login = json.data.viewer.login;
  const prs = json.data.repository.pullRequests.nodes
    .filter((p) => p.author?.login === login)
    .map<PRSummary>((p) => {
      const reviewCommentCount = p.reviewThreads.nodes.reduce(
        (sum, t) => sum + t.comments.totalCount,
        0,
      );
      const issueCommentCount = p.comments.totalCount;
      const ci = p.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;
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
        ciState: ci,
      };
    });
  return { login, prs };
}
