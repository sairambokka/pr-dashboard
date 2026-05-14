import { useMemo } from "react";
import type { InsightsPRSummary, PeriodRange } from "../../lib/insights";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Bucket {
  date: string;
  opened: number;
  merged: number;
}

interface Props {
  prs: InsightsPRSummary[] | undefined;
  range: PeriodRange;
  period: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d.toISOString().slice(0, 10);
}

export function computeThroughputBuckets(
  prs: InsightsPRSummary[],
  range: PeriodRange,
  period: string,
): Bucket[] {
  const useWeekly = period !== "7d" && period !== "30d";

  if (useWeekly) {
    // Weekly buckets. For ALL period cap at 26 weeks.
    const since = range.since;
    const weekStart = startOfWeek(since);
    const today = range.until;
    const maxWeeks = period === "all" ? 26 : 999;

    const bucketMap = new Map<string, Bucket>();
    let cursor = weekStart;
    let count = 0;
    while (cursor <= today && count < maxWeeks) {
      bucketMap.set(cursor, { date: cursor, opened: 0, merged: 0 });
      cursor = addDays(cursor, 7);
      count++;
    }

    for (const pr of prs) {
      const openedWeek = startOfWeek(pr.createdAt.slice(0, 10));
      if (bucketMap.has(openedWeek)) {
        bucketMap.get(openedWeek)!.opened++;
      }
      if (pr.mergedAt) {
        const mergedWeek = startOfWeek(pr.mergedAt.slice(0, 10));
        if (bucketMap.has(mergedWeek)) {
          bucketMap.get(mergedWeek)!.merged++;
        }
      }
    }

    return Array.from(bucketMap.values());
  }

  // Daily buckets
  const days = range.days > 0 ? range.days : 30;
  const bucketMap = new Map<string, Bucket>();
  for (let i = 0; i < days; i++) {
    const date = addDays(range.since, i);
    if (date > range.until) break;
    bucketMap.set(date, { date, opened: 0, merged: 0 });
  }

  for (const pr of prs) {
    const openedDate = pr.createdAt.slice(0, 10);
    if (bucketMap.has(openedDate)) {
      bucketMap.get(openedDate)!.opened++;
    }
    if (pr.mergedAt) {
      const mergedDate = pr.mergedAt.slice(0, 10);
      if (bucketMap.has(mergedDate)) {
        bucketMap.get(mergedDate)!.merged++;
      }
    }
  }

  return Array.from(bucketMap.values());
}

// ── Component ─────────────────────────────────────────────────────────────────

const SVG_W = 720;
const SVG_H = 200;
const GRID_YS = [50, 100, 150];

export function ThroughputChart({ prs, range, period }: Props) {
  const buckets = useMemo(
    () => computeThroughputBuckets(prs ?? [], range, period),
    [prs, range, period],
  );

  const yMax = Math.max(1, ...buckets.map((b) => b.opened), ...buckets.map((b) => b.merged));

  function toPoints(getter: (b: Bucket) => number): string {
    if (buckets.length === 0) return "";
    return buckets
      .map((b, i) => {
        const x = buckets.length === 1 ? SVG_W / 2 : (i / (buckets.length - 1)) * SVG_W;
        const y = SVG_H - (getter(b) / yMax) * SVG_H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  const periodLabel = period === "all" ? "ALL TIME" : `YOUR ${range.days}D`;
  const useWeekly = period !== "7d" && period !== "30d";
  const footLeft = period === "1y" ? "1Y AGO" : useWeekly ? "90D AGO" : `${range.days}D AGO`;
  const footMid = period === "1y" ? "6M AGO" : useWeekly ? "45D AGO" : `${Math.round(range.days / 2)}D AGO`;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <div className="chart-title">PR THROUGHPUT // {periodLabel}</div>
        <div className="chart-legend">
          <span>
            <span className="legend-swatch" style={{ background: "var(--yellow)" }} /> OPENED
          </span>
          <span>
            <span className="legend-swatch" style={{ background: "var(--green)" }} /> MERGED
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: SVG_H }}
      >
        <g stroke="var(--border-muted)" strokeWidth="1">
          {GRID_YS.map((y) => (
            <line key={y} x1="0" y1={y} x2={SVG_W} y2={y} />
          ))}
        </g>
        <polyline
          fill="none"
          stroke="var(--yellow)"
          strokeWidth="1.5"
          points={toPoints((b) => b.opened)}
        />
        <polyline
          fill="none"
          stroke="var(--green)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          points={toPoints((b) => b.merged)}
        />
        <line x1="0" y1={SVG_H} x2={SVG_W} y2={SVG_H} stroke="var(--border)" strokeWidth="1" />
      </svg>
      <div className="chart-foot">
        <span>{footLeft}</span>
        <span>{footMid}</span>
        <span>TODAY</span>
      </div>
    </div>
  );
}
