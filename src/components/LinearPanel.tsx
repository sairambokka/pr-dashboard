import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PRSummary } from "../lib/github";
import {
  fetchLinearViewer,
  fetchLinearActiveCycle,
  fetchLinearCycleIssues,
  fetchLinearOpenIssues,
} from "../lib/linear";
import type { LinearWorkflowState, LinearIssue } from "../lib/linear";

interface Props {
  apiKey: string;
  teamId: string | undefined;
  authoredPRs: PRSummary[];
  intervalMs: number;
}

const TICKET_PREFIX_REGEX = /^([A-Z]+-\d+):/;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short" }).toUpperCase();
}

function currentCycleDay(startsAt: string, endsAt: string): { day: number; total: number } {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const dayMs = 86_400_000;
  const total = Math.max(1, Math.round((end - start) / dayMs));
  const day = Math.max(1, Math.min(total, Math.round((now - start) / dayMs) + 1));
  return { day, total };
}

function getStatusBadge(state: LinearWorkflowState): { className: string; label: string } {
  const nameLower = state.name.toLowerCase();
  if (nameLower.includes("blocked")) {
    return { className: "status-badge status-blocked", label: state.name.toUpperCase() };
  }
  if (state.type === "started" && nameLower.includes("review")) {
    return { className: "status-badge status-review", label: state.name.toUpperCase() };
  }
  switch (state.type) {
    case "backlog":
    case "unstarted":
    case "canceled":
      return { className: "status-badge status-todo", label: state.name.toUpperCase() };
    case "started":
      return { className: "status-badge status-progress", label: state.name.toUpperCase() };
    case "completed":
      return { className: "status-badge status-done", label: state.name.toUpperCase() };
  }
}

function statusPriority(state: LinearWorkflowState): number {
  const nameLower = state.name.toLowerCase();
  if (nameLower.includes("blocked")) return 4;
  if (state.type === "started" && nameLower.includes("review")) return 1;
  switch (state.type) {
    case "started": return 2;
    case "backlog":
    case "unstarted": return 3;
    case "completed": return 5;
    case "canceled": return 6;
  }
}

function prStateLabel(pr: PRSummary): string {
  if (pr.isDraft) return "DRAFT";
  if (pr.effectiveReview === "APPROVED") return "▲ APPROVED";
  if (pr.effectiveReview === "CHANGES_REQUESTED") return "▼ CHANGES";
  return "OPEN";
}

export function LinearPanel({ apiKey, teamId, authoredPRs, intervalMs }: Props) {
  const viewerQuery = useQuery({
    queryKey: ["linearViewer"],
    queryFn: () => fetchLinearViewer(apiKey),
    refetchInterval: intervalMs,
    enabled: Boolean(apiKey),
  });

  const resolvedTeamId = teamId || viewerQuery.data?.teams[0]?.id || "";

  const cycleQuery = useQuery({
    queryKey: ["linearCycle", resolvedTeamId],
    queryFn: () => fetchLinearActiveCycle(apiKey, resolvedTeamId),
    refetchInterval: intervalMs,
    enabled: Boolean(apiKey && resolvedTeamId),
  });

  const issuesQuery = useQuery({
    queryKey: ["linearIssues", cycleQuery.data?.id],
    queryFn: () => {
      if (cycleQuery.data?.id) return fetchLinearCycleIssues(apiKey, cycleQuery.data.id);
      return fetchLinearOpenIssues(apiKey);
    },
    refetchInterval: intervalMs,
    enabled: Boolean(apiKey) && !cycleQuery.isFetching,
  });

  const mapping = useMemo(() => {
    const issueByIdentifier = new Map<string, LinearIssue>();
    for (const issue of issuesQuery.data ?? []) {
      issueByIdentifier.set(issue.identifier, issue);
    }
    const prByIdentifier = new Map<string, PRSummary>();
    for (const pr of authoredPRs) {
      const match = pr.title.match(TICKET_PREFIX_REGEX);
      if (match) prByIdentifier.set(match[1], pr);
    }
    const identifiers = new Set([...issueByIdentifier.keys(), ...prByIdentifier.keys()]);
    return Array.from(identifiers).map((id) => ({
      identifier: id,
      issue: issueByIdentifier.get(id),
      pr: prByIdentifier.get(id),
    }));
  }, [issuesQuery.data, authoredPRs]);

  const linkedRows = mapping.filter((r) => r.issue && r.pr);
  const linearOnlyRows = mapping.filter((r) => r.issue && !r.pr);

  const sortedLinked = useMemo(() => {
    return [...linkedRows].sort((a, b) => {
      const pa = statusPriority(a.issue!.state);
      const pb = statusPriority(b.issue!.state);
      if (pa !== pb) return pa - pb;
      return b.issue!.updatedAt.localeCompare(a.issue!.updatedAt);
    });
  }, [linkedRows]);

  const cycleStats = useMemo(() => {
    const issues = issuesQuery.data ?? [];
    let done = 0, inProg = 0, todo = 0;
    for (const i of issues) {
      if (i.state.type === "completed") done++;
      else if (i.state.type === "started") inProg++;
      else if (i.state.type === "backlog" || i.state.type === "unstarted") todo++;
    }
    return { done, inProg, todo, scope: issues.length };
  }, [issuesQuery.data]);

  if (viewerQuery.isError) {
    return (
      <div className="error">
        Linear authentication failed. Check API key in Settings.
      </div>
    );
  }

  if (viewerQuery.isSuccess && viewerQuery.data.teams.length === 0) {
    return (
      <div className="pr-empty">
        No teams found for your Linear account.
      </div>
    );
  }

  const noCycle = cycleQuery.isSuccess && cycleQuery.data === null;

  return (
    <div>
      {cycleQuery.data && (() => {
        const { day, total } = currentCycleDay(cycleQuery.data!.startsAt, cycleQuery.data!.endsAt);
        return (
          <div className="cycle-bar">
            <div className="cycle-label">
              CYCLE {cycleQuery.data!.number}
              <strong>{cycleQuery.data!.name}</strong>
            </div>
            <div>
              <div className="cycle-progress">
                <div
                  className="cycle-fill"
                  style={{ width: `${Math.round(cycleQuery.data!.progress * 100)}%` }}
                />
                <div
                  className="cycle-tick"
                  style={{ left: `${Math.round(cycleQuery.data!.progress * 100)}%` }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: "var(--muted)",
                  marginTop: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                <span>{formatDate(cycleQuery.data!.startsAt)}</span>
                <span>DAY {day} / {total}</span>
                <span>{formatDate(cycleQuery.data!.endsAt)}</span>
              </div>
            </div>
            <div className="cycle-stats">
              DONE <strong>{cycleStats.done}</strong> / IN-PROG <strong>{cycleStats.inProg}</strong> / TODO <strong>{cycleStats.todo}</strong>
              <br />
              <span style={{ fontSize: 9 }}>SCOPE {cycleStats.scope} · BURNED {cycleStats.scope > 0 ? Math.round((cycleStats.done / cycleStats.scope) * 100) : 0}%</span>
            </div>
          </div>
        );
      })()}

      {noCycle && (
        <div className="banner banner-info">
          Showing all open issues (no active cycle)
        </div>
      )}

      {issuesQuery.isSuccess && sortedLinked.length === 0 && linearOnlyRows.length === 0 && (
        <div className="pr-empty">No assigned tickets.</div>
      )}

      {(sortedLinked.length > 0 || linearOnlyRows.length > 0) && (
        <ul className="pr-list">
          <li className="row linear-row col-header">
            <span className="col-label">TICKET</span>
            <span className="col-label">TITLE</span>
            <span className="col-label">STATUS</span>
            <span></span>
            <span className="col-label">PR</span>
            <span className="col-label">PR STATE</span>
          </li>

          {sortedLinked.map((row) => {
            const issue = row.issue!;
            const pr = row.pr!;
            const badge = getStatusBadge(issue.state);
            return (
              <li key={issue.identifier} className="row linear-row">
                <a
                  className="ticket-id mono"
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {issue.identifier}
                </a>
                <span className="item-title">{issue.title}</span>
                <span>
                  <span className={badge.className}>{badge.label}</span>
                </span>
                <span className="link-arrow">→</span>
                <a
                  className="pr-num-cell mono"
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {pr.number}
                </a>
                <span className="item-title">{prStateLabel(pr)}</span>
              </li>
            );
          })}

          {linearOnlyRows.map((row) => {
            const issue = row.issue!;
            const badge = getStatusBadge(issue.state);
            return (
              <li key={issue.identifier} className="row linear-row" style={{ opacity: 0.55 }}>
                <a
                  className="ticket-id mono"
                  href={issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {issue.identifier}
                </a>
                <span className="item-title muted">{issue.title}</span>
                <span>
                  <span className={badge.className}>{badge.label}</span>
                </span>
                <span className="link-arrow">—</span>
                <span className="t-dim">—</span>
                <span className="t-dim">—</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
