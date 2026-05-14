import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchInsightsPRs,
  fetchRepoStats,
  fetchContributors,
  fetchCommitActivity,
  getPeriodRange,
} from "../lib/insights";
import type { Period } from "../lib/insights";
import { POLL_HOURLY_MS } from "../lib/constants";
import type { NextAction } from "../lib/types";
import { ThroughputChart } from "./insights/ThroughputChart";
import { TopReviewers } from "./insights/TopReviewers";
import { CommitCadence } from "./insights/CommitCadence";
import { RepoHealth } from "./insights/RepoHealth";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  owner: string;
  repo: string;
  viewerLogin: string;
  viewerAvatarUrl: string;
  repoCreatedAt: string;
  intervalMs: number;
  reviewQueueCount?: number;
  reviewQueueOldestDays?: number;
  nextAction?: NextAction | null;
}

// ── Delta helpers ─────────────────────────────────────────────────────────────

interface Delta {
  up: boolean;
  text: string;
}

function pctDelta(current: number | null, prev: number | null, days: number): Delta | null {
  if (days === 0 || current == null || prev == null) return null;
  const pct = ((current - prev) / Math.max(prev, 1)) * 100;
  return {
    up: pct >= 0,
    text: `${pct > 0 ? "+" : ""}${Math.round(pct)}% VS PREV ${days}D`,
  };
}

function daysDelta(current: number | null, prev: number | null, days: number): Delta | null {
  if (days === 0 || current == null || prev == null) return null;
  const diff = current - prev;
  return {
    up: diff >= 0,
    text: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}D VS PREV ${days}D`,
  };
}

// ── Median helper ─────────────────────────────────────────────────────────────

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Card sub-component ────────────────────────────────────────────────────────

interface CardProps {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  accent?: boolean;
  delta?: Delta | null;
  invertDelta?: boolean;
  foot?: string;
}

function Card({ label, value, unit, accent, delta, invertDelta, foot }: CardProps) {
  const displayValue = value === null || value === undefined ? "—" : value;
  const showUnit = unit != null && value !== null && value !== undefined;
  const showDelta = delta != null;
  const deltaUp = invertDelta ? !delta?.up : delta?.up;

  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value mono${accent ? " accent" : ""}`}>
        {displayValue}
        {showUnit && <span className="card-unit">{unit}</span>}
      </div>
      {showDelta && (
        <div className={`card-delta${deltaUp ? "" : " down"}`}>{delta.text}</div>
      )}
      {foot && <div className="card-foot">{foot}</div>}
    </div>
  );
}

// ── ContribPanel sub-component ────────────────────────────────────────────────

interface ContribPanelProps {
  viewerLogin: string;
  viewerAvatarUrl: string;
  totalCommits: number;
  totalAdded: number;
  totalRemoved: number;
  myRank: number | null;
  chartWeeks: Array<{ w: number; c: number }>;
}

function ContribPanel({
  viewerLogin,
  viewerAvatarUrl,
  totalCommits,
  totalAdded,
  totalRemoved,
  myRank,
  chartWeeks,
}: ContribPanelProps) {
  const maxCommits = Math.max(1, ...chartWeeks.map((w) => w.c));

  // Y-axis: 5 labels from maxCommits down to 0
  const yLabels = [4, 3, 2, 1, 0].map((i) => Math.round((maxCommits * i) / 4));

  // X-axis: ~5 evenly-spaced labels
  const xIndices =
    chartWeeks.length <= 1
      ? [0]
      : [0, 1, 2, 3, 4].map((i) => Math.round((i * (chartWeeks.length - 1)) / 4));
  const uniqueXIndices = [...new Set(xIndices)];

  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" });

  // SVG dimensions
  const svgW = 720;
  const svgH = 160;
  const barArea = svgW; // bars fill full width; y-axis labels are outside (positioned absolute)
  const barCount = chartWeeks.length;
  const barW = barCount > 0 ? barArea / barCount : barArea;
  const barGap = Math.max(1, barW * 0.15);
  const barNetW = Math.max(1, barW - barGap);

  // Grid lines at 25%, 50%, 75% heights (y positions in SVG)
  const gridYs = [svgH * 0.25, svgH * 0.5, svgH * 0.75];

  return (
    <div className="contrib-panel">
      <div className="contrib-head">
        <div className="contrib-user">
          {viewerAvatarUrl ? (
            <img
              className="avatar"
              src={viewerAvatarUrl}
              alt=""
              style={{ objectFit: "cover", borderRadius: 0 }}
            />
          ) : (
            <div className="avatar mono">{viewerLogin.slice(0, 2).toUpperCase()}</div>
          )}
          <div>
            <div className="contrib-handle mono">@{viewerLogin}</div>
            <div className="contrib-sub">
              <span className="mono">
                <strong>{totalCommits}</strong> COMMITS
              </span>
              <span className="t-green mono">
                <strong>+{totalAdded.toLocaleString()}</strong>
              </span>
              <span className="t-red mono">
                <strong>−{totalRemoved.toLocaleString()}</strong>
              </span>
            </div>
          </div>
        </div>
        {myRank !== null && (
          <div className="contrib-rank">
            <div className="rank-label">REPO RANK</div>
            <div className="rank-value mono">#{myRank}</div>
          </div>
        )}
      </div>

      <div className="contrib-chart-wrap">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          className="contrib-chart"
        >
          {/* Grid lines */}
          <g stroke="var(--border-muted)" strokeWidth="1" strokeDasharray="2 4">
            {gridYs.map((y) => (
              <line key={y} x1="0" y1={y} x2={svgW} y2={y} />
            ))}
          </g>

          {/* Bars */}
          <g fill="var(--accent)">
            {chartWeeks.map((week, i) => {
              const barHeight = (week.c / maxCommits) * svgH;
              const x = i * barW + barGap / 2;
              const y = svgH - barHeight;
              return (
                <rect
                  key={week.w}
                  x={x}
                  y={y}
                  width={barNetW}
                  height={barHeight}
                  opacity={week.c === 0 ? 0.25 : 1}
                />
              );
            })}
          </g>

          {/* Bottom border */}
          <line x1="0" y1={svgH} x2={svgW} y2={svgH} stroke="var(--border)" strokeWidth="1" />
        </svg>

        <div className="y-axis-labels">
          {yLabels.map((v) => (
            <span key={v} className="mono">
              {v}
            </span>
          ))}
        </div>

        <div className="x-axis-labels">
          {uniqueXIndices.map((idx) => {
            const week = chartWeeks[idx];
            if (!week) return null;
            const label = fmt.format(new Date(week.w * 1000)).toUpperCase();
            return <span key={week.w}>{label}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

// ── InsightsPanel ─────────────────────────────────────────────────────────────

const VALID_PERIODS: Period[] = ["7d", "30d", "90d", "1y", "all"];

export function InsightsPanel({
  token,
  owner,
  repo,
  viewerLogin,
  viewerAvatarUrl,
  repoCreatedAt,
  intervalMs,
  reviewQueueCount,
  reviewQueueOldestDays,
  nextAction,
}: Props) {
  const [period, setPeriod] = useState<Period>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("period") as Period | null;
    if (fromUrl && VALID_PERIODS.includes(fromUrl)) return fromUrl;
    const stored = localStorage.getItem("pr-dashboard.insightsPeriod") as Period | null;
    if (stored && VALID_PERIODS.includes(stored)) return stored;
    return "30d";
  });

  useEffect(() => {
    localStorage.setItem("pr-dashboard.insightsPeriod", period);
    const params = new URLSearchParams(window.location.search);
    params.set("period", period);
    window.history.replaceState(null, "", `?${params.toString()}${window.location.hash}`);
  }, [period]);

  const range = useMemo(() => getPeriodRange(period, repoCreatedAt), [period, repoCreatedAt]);

  const enabled = Boolean(token && owner && repo && viewerLogin && repoCreatedAt);

  const { data: prs } = useQuery({
    queryKey: ["insightsPRs", owner, repo, viewerLogin, period, range.since, range.until],
    queryFn: () => fetchInsightsPRs(token, owner, repo, viewerLogin, range),
    refetchInterval: intervalMs,
    enabled,
  });

  const { data: prevPrs } = useQuery({
    queryKey: [
      "insightsPRsPrev",
      owner,
      repo,
      viewerLogin,
      range.previousSince,
      range.previousUntil,
    ],
    queryFn: () =>
      fetchInsightsPRs(token, owner, repo, viewerLogin, {
        since: range.previousSince,
        until: range.previousUntil,
        previousSince: "",
        previousUntil: "",
        days: range.days,
      }),
    refetchInterval: intervalMs,
    enabled: enabled && range.days > 0,
  });

  const { data: repoStats } = useQuery({
    queryKey: ["repoStats", owner, repo],
    queryFn: () => fetchRepoStats(token, owner, repo),
    refetchInterval: intervalMs,
    enabled: Boolean(token && owner && repo),
  });

  const { data: contributors } = useQuery({
    queryKey: ["contributors", owner, repo],
    queryFn: () => fetchContributors(token, owner, repo),
    refetchInterval: POLL_HOURLY_MS,
    enabled: Boolean(token && owner && repo),
  });

  const { data: commitActivity } = useQuery({
    queryKey: ["commitActivity", owner, repo],
    queryFn: () => fetchCommitActivity(token, owner, repo),
    refetchInterval: POLL_HOURLY_MS,
    enabled: Boolean(token && owner && repo),
  });

  // ── Contributor stats ───────────────────────────────────────────────────────

  const myContributor = contributors?.find((c) => c.login === viewerLogin);
  const allRanked = (contributors ?? []).slice().sort((a, b) => b.total - a.total);
  const myRank = myContributor
    ? allRanked.findIndex((c) => c.login === viewerLogin) + 1
    : null;

  const sinceMs = range.since ? new Date(range.since).getTime() / 1000 : 0;
  const windowedWeeks = myContributor?.weeks.filter((w) => w.w >= sinceMs) ?? [];
  const totalCommits = windowedWeeks.reduce((s, w) => s + w.c, 0);
  const totalAdded = windowedWeeks.reduce((s, w) => s + w.a, 0);
  const totalRemoved = windowedWeeks.reduce((s, w) => s + w.d, 0);

  const chartWeeks = period === "all" ? windowedWeeks.slice(-26) : windowedWeeks;

  // ── Compute stats ───────────────────────────────────────────────────────────

  const opened = prs?.prs.filter((p) => p.createdAt >= range.since).length ?? 0;
  const merged =
    prs?.prs.filter((p) => p.mergedAt && p.mergedAt >= range.since).length ?? 0;
  const prevOpened =
    prevPrs?.prs.filter((p) => p.createdAt >= range.previousSince).length ?? 0;
  const prevMerged =
    prevPrs?.prs.filter(
      (p) => p.mergedAt && p.mergedAt >= range.previousSince,
    ).length ?? 0;

  const mergedPRs = prs?.prs.filter((p) => p.mergedAt) ?? [];
  const ttmDays = mergedPRs
    .map(
      (p) =>
        (new Date(p.mergedAt!).getTime() - new Date(p.createdAt).getTime()) / 86_400_000,
    )
    .sort((a, b) => a - b);
  const medianTtm = ttmDays.length > 0 ? median(ttmDays) : null;

  const prevMergedPRs = prevPrs?.prs.filter((p) => p.mergedAt) ?? [];
  const prevTtmDays = prevMergedPRs
    .map(
      (p) =>
        (new Date(p.mergedAt!).getTime() - new Date(p.createdAt).getTime()) / 86_400_000,
    )
    .sort((a, b) => a - b);
  const prevMedianTtm = prevTtmDays.length > 0 ? median(prevTtmDays) : null;

  const withCI =
    prs?.prs.filter(
      (p) =>
        p.firstCommitCiState !== null &&
        p.firstCommitCiState !== "PENDING" &&
        p.firstCommitCiState !== "EXPECTED",
    ) ?? [];
  const failed = withCI.filter(
    (p) => p.firstCommitCiState === "FAILURE" || p.firstCommitCiState === "ERROR",
  ).length;
  const ciFailRate = withCI.length > 0 ? Math.round((failed / withCI.length) * 100) : null;

  const prevWithCI =
    prevPrs?.prs.filter(
      (p) =>
        p.firstCommitCiState !== null &&
        p.firstCommitCiState !== "PENDING" &&
        p.firstCommitCiState !== "EXPECTED",
    ) ?? [];
  const prevFailed = prevWithCI.filter(
    (p) => p.firstCommitCiState === "FAILURE" || p.firstCommitCiState === "ERROR",
  ).length;
  const prevCiFailRate =
    prevWithCI.length > 0 ? Math.round((prevFailed / prevWithCI.length) * 100) : null;

  const mergedInPeriod = prs?.prs.filter((p) => p.mergedAt).length ?? 0;
  const mergesPerDay =
    range.days > 0 ? (mergedInPeriod / range.days).toFixed(1) : "—";

  const foot = `${viewerLogin.toUpperCase()} · ${period.toUpperCase()}`;
  const periodLabel = period === "all" ? "ALL TIME" : `ROLLING ${range.days} DAYS`;

  return (
    <div>
      {nextAction ? (
        <a
          href={nextAction.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pr-of-day"
        >
          <div className="pod-label">◆ NEXT ACTION</div>
          <div className="pod-title">{nextAction.prTitle}</div>
          <div className="pod-meta">
            PR <span className="num mono">{nextAction.prNumber}</span> · {nextAction.label} ·{" "}
            {nextAction.ageDescription}
          </div>
        </a>
      ) : (
        <div className="pr-of-day pr-of-day-empty">
          <div className="pod-label">◆ NEXT ACTION</div>
          <div className="pod-title">Inbox zero. Nothing waiting on you.</div>
        </div>
      )}

      <div className="period-toggle">
        {(["7d", "30d", "90d", "1y", "all"] as const).map((p) => (
          <button
            key={p}
            className="period-btn"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="section-head">
        <div className="section-title">INSIGHTS // {periodLabel}</div>
        <div className="section-meta">PERSONAL · REPO HEALTH</div>
      </div>

      {prs?.hasMore === true && period === "all" && (
        <div className="banner banner-info">
          Showing first 1000 PRs. Older results truncated.
        </div>
      )}

      <ContribPanel
        viewerLogin={viewerLogin}
        viewerAvatarUrl={viewerAvatarUrl}
        totalCommits={totalCommits}
        totalAdded={totalAdded}
        totalRemoved={totalRemoved}
        myRank={myRank}
        chartWeeks={chartWeeks}
      />

      <div className="grid">
        <Card
          label="PRs Opened"
          value={opened}
          delta={pctDelta(opened, prevOpened, range.days)}
          foot={foot}
        />
        <Card
          label="PRs Merged"
          value={merged}
          accent
          delta={pctDelta(merged, prevMerged, range.days)}
          foot={foot}
        />
        <Card
          label="Median Time to Merge"
          value={medianTtm !== null ? +medianTtm.toFixed(1) : null}
          unit="DAYS"
          delta={daysDelta(medianTtm, prevMedianTtm, range.days)}
          invertDelta
          foot="YOUR PRS"
        />
        <Card
          label="Your Review Queue"
          value={reviewQueueCount ?? "—"}
          foot={reviewQueueOldestDays != null ? `OLDEST · ${reviewQueueOldestDays}D` : undefined}
        />
        <Card
          label="Repo Open PRs"
          value={repoStats?.openCount}
          foot={
            repoStats
              ? `OLDEST · ${repoStats.oldestOpenDays ?? "—"}D · STALE: ${repoStats.staleCount}`
              : undefined
          }
        />
        <Card
          label="CI Fail Rate (First Push)"
          value={ciFailRate}
          unit="%"
          delta={pctDelta(ciFailRate, prevCiFailRate, range.days)}
          invertDelta
          foot={`YOUR PRS · ${period.toUpperCase()}`}
        />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <ThroughputChart prs={prs?.prs} range={range} period={period} />
        <TopReviewers prs={prs?.prs} viewerLogin={viewerLogin} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginTop: "24px",
          marginBottom: "32px",
        }}
      >
        <CommitCadence data={commitActivity} />
        <RepoHealth stats={repoStats} mergesPerDay={mergesPerDay} />
      </div>
    </div>
  );
}
