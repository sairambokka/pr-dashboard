import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInsightsPRs, fetchRepoStats, getPeriodRange } from "../lib/insights";
import type { Period } from "../lib/insights";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  token: string;
  owner: string;
  repo: string;
  viewerLogin: string;
  repoCreatedAt: string;
  intervalMs: number;
  reviewQueueCount?: number;
  reviewQueueOldestDays?: number;
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

// ── InsightsPanel ─────────────────────────────────────────────────────────────

const VALID_PERIODS: Period[] = ["7d", "30d", "90d", "1y", "all"];

export function InsightsPanel({
  token,
  owner,
  repo,
  viewerLogin,
  repoCreatedAt,
  intervalMs,
  reviewQueueCount,
  reviewQueueOldestDays,
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

  const foot = `${viewerLogin.toUpperCase()} · ${period.toUpperCase()}`;
  const periodLabel = period === "all" ? "ALL TIME" : `ROLLING ${range.days} DAYS`;

  return (
    <div>
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
    </div>
  );
}
