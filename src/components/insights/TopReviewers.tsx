import { useMemo } from "react";
import type { InsightsPRSummary } from "../../lib/insights";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewerCount {
  login: string;
  count: number;
}

interface Props {
  prs: InsightsPRSummary[] | undefined;
  viewerLogin: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function aggregateReviewers(
  prs: InsightsPRSummary[],
  viewerLogin: string,
): ReviewerCount[] {
  const map = new Map<string, number>();
  for (const pr of prs) {
    for (const r of pr.reviewers) {
      if (r === viewerLogin) continue;
      map.set(r, (map.get(r) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TopReviewers({ prs, viewerLogin }: Props) {
  const counts = useMemo(
    () => aggregateReviewers(prs ?? [], viewerLogin),
    [prs, viewerLogin],
  );

  const top5 = counts.slice(0, 5);
  const max = top5[0]?.count ?? 1;

  return (
    <div className="card">
      <div className="card-label" style={{ marginBottom: "16px" }}>
        YOUR TOP REVIEWERS
      </div>
      {top5.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: "12px" }}>No reviews in this period.</div>
      ) : (
        top5.map((r) => (
          <div className="reviewer-row" key={r.login}>
            <span className="reviewer-name mono">{r.login}</span>
            <span className="reviewer-bar-bg">
              <span
                className="reviewer-bar"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="reviewer-count mono">{String(r.count).padStart(2, "0")}</span>
          </div>
        ))
      )}
    </div>
  );
}
