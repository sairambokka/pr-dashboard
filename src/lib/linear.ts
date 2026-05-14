export type LinearStateType = "backlog" | "unstarted" | "started" | "completed" | "canceled";

export interface LinearTeam {
  id: string;
  key: string;
  name: string;
}

export interface LinearViewer {
  id: string;
  name: string;
  email: string;
  teams: LinearTeam[];
}

export interface LinearWorkflowState {
  id: string;
  name: string;
  type: LinearStateType;
  color: string;
}

export interface LinearCycle {
  id: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  progress: number;
  scopeHistory: number[];
  completedScopeHistory: number[];
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  state: LinearWorkflowState;
  cycle: { id: string; number: number } | null;
  updatedAt: string;
}

const VIEWER_QUERY = `
query Viewer {
  viewer {
    id
    name
    email
    teams { nodes { id key name } }
  }
}`;

const ACTIVE_CYCLE_QUERY = `
query ActiveCycle($teamId: String!) {
  cycles(
    filter: { team: { id: { eq: $teamId } }, isActive: { eq: true } }
    first: 1
  ) {
    nodes {
      id number name startsAt endsAt progress
      scopeHistory completedScopeHistory
    }
  }
}`;

const CYCLE_ISSUES_QUERY = `
query CycleIssues($cycleId: String!) {
  issues(
    filter: {
      assignee: { isMe: { eq: true } }
      cycle: { id: { eq: $cycleId } }
    }
    first: 100
  ) {
    nodes {
      id identifier title url priority updatedAt
      state { id name type color }
      cycle { id number }
    }
  }
}`;

const OPEN_ISSUES_QUERY = `
query OpenIssues {
  issues(
    filter: {
      assignee: { isMe: { eq: true } }
      state: { type: { nin: ["completed", "canceled"] } }
    }
    first: 100
  ) {
    nodes {
      id identifier title url priority updatedAt
      state { id name type color }
      cycle { id number }
    }
  }
}`;

async function linearGql<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  if (!json.data) throw new Error("Empty Linear response");
  return json.data;
}

export async function fetchLinearViewer(apiKey: string): Promise<LinearViewer> {
  const data = await linearGql<{
    viewer: {
      id: string;
      name: string;
      email: string;
      teams: { nodes: LinearTeam[] };
    };
  }>(apiKey, VIEWER_QUERY);
  return {
    id: data.viewer.id,
    name: data.viewer.name,
    email: data.viewer.email,
    teams: data.viewer.teams.nodes,
  };
}

export async function fetchLinearActiveCycle(
  apiKey: string,
  teamId: string,
): Promise<LinearCycle | null> {
  const data = await linearGql<{ cycles: { nodes: LinearCycle[] } }>(
    apiKey,
    ACTIVE_CYCLE_QUERY,
    { teamId },
  );
  return data.cycles.nodes[0] ?? null;
}

export async function fetchLinearCycleIssues(
  apiKey: string,
  cycleId: string,
): Promise<LinearIssue[]> {
  const data = await linearGql<{ issues: { nodes: LinearIssue[] } }>(
    apiKey,
    CYCLE_ISSUES_QUERY,
    { cycleId },
  );
  return data.issues.nodes;
}

export async function fetchLinearOpenIssues(apiKey: string): Promise<LinearIssue[]> {
  const data = await linearGql<{ issues: { nodes: LinearIssue[] } }>(apiKey, OPEN_ISSUES_QUERY);
  return data.issues.nodes;
}
