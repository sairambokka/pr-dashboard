import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMyPRs,
  isCiFailed,
  type PRSummary,
} from "../lib/github";
import {
  POLL_INSIGHTS_MS,
  POLL_LINEAR_MS,
} from "../lib/constants";
import type { NextAction } from "../lib/types";
import {
  loadSeen,
  saveSeen,
  saveLastRepo,
  type SeenEntry,
  type SeenMap,
  type Settings,
} from "../lib/storage";
import { setFaviconBadge } from "../lib/favicon";
import { ensureNotifyPermission, notify } from "../lib/notify";
import { hrefFor, navTo, goHome, type RepoTab } from "../lib/router";
import { useIsVisible } from "../lib/useVisibility";
import { InsightsPanel } from "./InsightsPanel";
import { LinearPanel } from "./LinearPanel";

// ── Small icon components (local to this file) ────────────────────────────────

function ageDescription(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  return `${d}D AGO`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? "1 day ago" : `${d} days ago`;
  if (d < 14) return "last week";
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

function PrIcon({ state }: { state: "open" | "draft" | "merged" }) {
  const color = state === "draft" ? "#000000" : state === "merged" ? "#7C3AED" : "#00C853";
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill={color}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.189l2.72-2.719a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#00C853" aria-hidden="true">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#FF1744" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#FF6B6B" aria-hidden="true">
      <circle cx="8" cy="8" r="4" />
    </svg>
  );
}

function reviewBadge(pr: PRSummary) {
  const effective = pr.effectiveReview;
  if (effective === "APPROVED") {
    const who = pr.approvers.length
      ? `Approved by ${pr.approvers.map((a) => `@${a}`).join(", ")}`
      : "Approved";
    return (
      <span className="badge badge-approved" title={who}>
        <CheckIcon /> Approved{pr.approvers.length > 1 ? ` (${pr.approvers.length})` : ""}
      </span>
    );
  }
  if (effective === "CHANGES_REQUESTED") {
    const who = pr.changeRequesters.length
      ? `Changes requested by ${pr.changeRequesters.map((a) => `@${a}`).join(", ")}`
      : "Changes requested";
    return (
      <span className="badge badge-changes" title={who}>
        <XIcon /> Changes requested
      </span>
    );
  }
  return null;
}

function ciIcon(state: PRSummary["ciState"]) {
  switch (state) {
    case "SUCCESS":
      return <CheckIcon />;
    case "FAILURE":
    case "ERROR":
      return <XIcon />;
    case "PENDING":
    case "EXPECTED":
      return <DotIcon />;
    default:
      return null;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RepoWorkspaceProps {
  token: string;
  owner: string;
  repo: string;
  tab: RepoTab;
  settings: Settings;
  setShowSettings: (b: boolean) => void;
  intervalMs: number;
  onCheatsheet?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RepoWorkspace({
  token,
  owner,
  repo,
  tab,
  settings,
  setShowSettings,
  intervalMs,
  onCheatsheet,
}: RepoWorkspaceProps): React.JSX.Element {
  const isVisible = useIsVisible();
  const [seen, setSeen] = useState<SeenMap>(loadSeen);
  const [scope, setScope] = useState<"authored" | "all">("authored");
  const seenRef = useRef(seen);
  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);

  // Save last visited repo on mount (and whenever owner/repo changes)
  useEffect(() => {
    saveLastRepo(owner, repo);
  }, [owner, repo]);

  useEffect(() => {
    void ensureNotifyPermission();
  }, []);

  const { data, error, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["prs", owner, repo],
    queryFn: () => fetchMyPRs(token, owner, repo),
    refetchInterval: intervalMs,
    enabled: Boolean(token && owner && repo),
  });

  const viewer = data?.viewer ?? { login: "", name: null, avatarUrl: "" };
  const prs = data?.prs ?? [];
  const allPrs = data?.allPrs ?? [];
  const authoredCount = prs.length;
  const allCount = allPrs.length;

  const lastFetchedStatsRef = useRef<Record<number, { totalComments: number; latestReviewSubmittedAt: string | null; ciState: PRSummary["ciState"] }>>({});

  useEffect(() => {
    if (!data) return;
    const { prs: fresh } = data;
    const prior = seenRef.current;
    const next: SeenMap = { ...prior };
    const lastStats = lastFetchedStatsRef.current;
    const nextStats: typeof lastStats = {};
    const tabFocused = typeof document !== "undefined" && document.hasFocus();
    const onPrsTab = tab === "prs";
    const shouldNotify = !(tabFocused && onPrsTab);

    let seenChanged = false;

    for (const pr of fresh) {
      const currentStats = {
        totalComments: pr.totalCommentCount,
        latestReviewSubmittedAt: pr.latestReviewSubmittedAt,
        ciState: pr.ciState,
      };

      if (!(pr.number in prior)) {
        next[pr.number] = currentStats;
        seenChanged = true;
      }

      if (pr.number in lastStats) {
        const prevStats = lastStats[pr.number];

        const commentDelta = pr.totalCommentCount - prevStats.totalComments;
        if (shouldNotify && commentDelta > 0) {
          notify(
            `PR #${pr.number}: ${commentDelta} new comment${commentDelta === 1 ? "" : "s"}`,
            pr.title,
            pr.url,
          );
        }

        const reviewAdvanced =
          pr.latestReviewSubmittedAt !== null &&
          (prevStats.latestReviewSubmittedAt === null ||
            pr.latestReviewSubmittedAt > prevStats.latestReviewSubmittedAt);
        if (shouldNotify && reviewAdvanced) {
          notify(`PR #${pr.number}: new review`, pr.title, pr.url);
        }

        const ciTurnedBad =
          pr.ciState !== null &&
          isCiFailed(pr.ciState) &&
          (prevStats.ciState === null || !isCiFailed(prevStats.ciState));
        if (shouldNotify && ciTurnedBad) {
          notify(`PR #${pr.number}: CI failed`, pr.title, pr.url);
        }
      }

      nextStats[pr.number] = currentStats;
    }

    for (const key of Object.keys(next)) {
      if (!fresh.some((p) => String(p.number) === key)) {
        delete next[Number(key)];
        seenChanged = true;
      }
    }

    lastFetchedStatsRef.current = nextStats;

    if (seenChanged) {
      setSeen(next);
      saveSeen(next);
    }
  }, [data?.prs, dataUpdatedAt, tab]);

  const unreadByPr = useMemo(() => {
    const map: Record<number, { unread: boolean; count: number }> = {};
    let total = 0;
    for (const pr of prs) {
      const prior = seen[pr.number];
      if (!prior) {
        map[pr.number] = { unread: false, count: 0 };
        continue;
      }
      const commentDelta = Math.max(0, pr.totalCommentCount - prior.totalComments);
      const reviewAdvanced =
        pr.latestReviewSubmittedAt !== null &&
        (prior.latestReviewSubmittedAt === null ||
          pr.latestReviewSubmittedAt > prior.latestReviewSubmittedAt);
      const ciTurnedBad =
        pr.ciState !== null &&
        isCiFailed(pr.ciState) &&
        (prior.ciState === null || !isCiFailed(prior.ciState));
      const unread = commentDelta > 0 || reviewAdvanced || ciTurnedBad;
      map[pr.number] = { unread, count: commentDelta };
      total += commentDelta;
    }
    return { map, total };
  }, [prs, seen]);

  useEffect(() => {
    setFaviconBadge(unreadByPr.total);
  }, [unreadByPr.total]);

  useEffect(() => {
    const prefix = unreadByPr.total > 0 ? `(${unreadByPr.total}) ` : "";
    document.title = `${prefix}PR Dashboard`;
  }, [unreadByPr.total]);

  const nextAction = useMemo((): NextAction | null => {
    const authored = data?.prs ?? [];

    for (const pr of authored) {
      if (pr.effectiveReview === "CHANGES_REQUESTED" && (unreadByPr.map[pr.number]?.count ?? 0) > 0) {
        return { prNumber: pr.number, prTitle: pr.title, prUrl: pr.url, label: "CHANGES REQUESTED", ageDescription: ageDescription(pr.updatedAt) };
      }
    }

    for (const pr of authored) {
      if (pr.effectiveReview === "APPROVED" && pr.ciState === "SUCCESS") {
        return { prNumber: pr.number, prTitle: pr.title, prUrl: pr.url, label: "READY TO MERGE", ageDescription: ageDescription(pr.updatedAt) };
      }
    }

    for (const pr of authored) {
      if ((unreadByPr.map[pr.number]?.count ?? 0) > 0) {
        return { prNumber: pr.number, prTitle: pr.title, prUrl: pr.url, label: "NEW COMMENTS", ageDescription: ageDescription(pr.updatedAt) };
      }
    }

    return null;
  }, [data?.prs, unreadByPr.map]);

  const markRead = useCallback((pr: PRSummary) => {
    const entry: SeenEntry = {
      totalComments: pr.totalCommentCount,
      latestReviewSubmittedAt: pr.latestReviewSubmittedAt,
      ciState: pr.ciState,
    };
    const next = { ...seenRef.current, [pr.number]: entry };
    setSeen(next);
    saveSeen(next);
  }, []);

  const markAllRead = useCallback(() => {
    const next: SeenMap = {};
    for (const pr of prs) {
      next[pr.number] = {
        totalComments: pr.totalCommentCount,
        latestReviewSubmittedAt: pr.latestReviewSubmittedAt,
        ciState: pr.ciState,
      };
    }
    setSeen(next);
    saveSeen(next);
  }, [prs]);

  const handlePrClick = (e: React.MouseEvent<HTMLAnchorElement>, pr: PRSummary) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    markRead(pr);
    window.open(pr.url, "_blank", "noopener,noreferrer");
  };

  // Keyboard shortcuts scoped to this workspace
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "r":
        case "R":
          void refetch();
          e.preventDefault();
          break;
        case "1":
          navTo(owner, repo, "prs");
          e.preventDefault();
          break;
        case "2":
          navTo(owner, repo, "insights");
          e.preventDefault();
          break;
        case "3":
          navTo(owner, repo, "linear");
          e.preventDefault();
          break;
        case ",":
          setShowSettings(true);
          e.preventDefault();
          break;
        case "?":
          onCheatsheet?.();
          e.preventDefault();
          break;
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [owner, repo, refetch, setShowSettings, onCheatsheet]);

  const errorMessage = error instanceof Error ? error.message : error ? String(error) : null;
  const lastFetch = dataUpdatedAt > 0 ? dataUpdatedAt : null;
  const tabPrsCount = authoredCount + allCount;

  const anyError = Boolean(error);
  const liveState: "live" | "paused" | "error" = !isVisible
    ? "paused"
    : anyError
      ? "error"
      : "live";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <button className="home-link" onClick={goHome} aria-label="Back to mission control home">
            ← Home
          </button>
          <a
            className="repo-crumb"
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {owner}
            <span className="slash">/</span>
            <strong>{repo}</strong>
          </a>
          {viewer.login && <span className="user-tag">{viewer.login}</span>}
          <div className="topbar-actions">
            {lastFetch && (
              <span className="ts">Updated {relativeTime(new Date(lastFetch).toISOString())}</span>
            )}
            <span className={`live-pill live-pill-${liveState} rotate-1`}>
              <span className="live-dot" />
              {liveState.toUpperCase()}
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={markAllRead}
              disabled={!unreadByPr.total}
            >
              Mark all read
            </button>
            <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>
              Settings
            </button>
          </div>
        </div>
        <nav className="tabs">
          <div className="tabs-row">
            <a
              href={hrefFor(owner, repo, "prs")}
              className={`tab${tab === "prs" ? " tab-nav-active" : ""}`}
              aria-current={tab === "prs" ? "page" : undefined}
            >
              PRS <span className="tab-count">{tabPrsCount || ""}</span>
            </a>
            <a
              href={hrefFor(owner, repo, "insights")}
              className={`tab${tab === "insights" ? " tab-nav-active" : ""}`}
              aria-current={tab === "insights" ? "page" : undefined}
            >
              INSIGHTS
            </a>
            <a
              href={hrefFor(owner, repo, "linear")}
              className={`tab${tab === "linear" ? " tab-nav-active" : ""}`}
              aria-current={tab === "linear" ? "page" : undefined}
            >
              LINEAR
            </a>
          </div>
        </nav>
      </header>

      {tab === "prs" && (
        <main className="main">
          {errorMessage && <div className="error">{errorMessage}</div>}

          {isFetching && !data && (
            <div className="banner banner-info">Loading PRs…</div>
          )}

          <div className="scope-toggle -rotate-1">
            <button
              className="scope-btn"
              aria-pressed={scope === "authored"}
              onClick={() => setScope("authored")}
            >
              Authored <span className="scope-count">{authoredCount}</span>
            </button>
            <button
              className="scope-btn"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              All open <span className="scope-count">{allCount}</span>
            </button>
          </div>

          {scope === "authored" && (
            <div className="pr-panel">
              <ul className="pr-list">
                {prs.map((pr) => {
                  const unreadEntry = unreadByPr.map[pr.number];
                  const isUnread = unreadEntry?.unread ?? false;
                  const unreadCount = unreadEntry?.count ?? 0;
                  const age = ageDescription(pr.updatedAt);
                  return (
                    <a
                      key={pr.number}
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handlePrClick(e, pr)}
                      className={`row pr-row${isUnread ? " is-unread" : ""}`}
                    >
                      <span className="pr-num-cell-row">
                        <span className="pr-num mono">{pr.number}</span>
                      </span>
                      <span className="pr-icon-cell">
                        <PrIcon state={pr.isDraft ? "draft" : "open"} />
                      </span>
                      <span className="pr-content">
                        <span className="pr-title-row">
                          <span className="pr-title">{pr.title}</span>
                          {pr.isDraft && <span className="label label-muted">Draft</span>}
                          {reviewBadge(pr)}
                        </span>
                        <span className="pr-meta">
                          <span className="author">{viewer.login || owner}</span>
                          <span className="sep">/</span>
                          <span>{pr.headRefName}</span>
                        </span>
                      </span>
                      <span className="ci-col">{ciIcon(pr.ciState)}</span>
                      <span className="comment-col mono">
                        <CommentIcon />
                        {String(pr.totalCommentCount).padStart(2, "0")}
                      </span>
                      <span className="age-col mono">{age.replace(" AGO", "")}</span>
                      <span className="bubble-slot">
                        {unreadCount > 0 && (
                          <button
                            className="bubble"
                            title={`${unreadCount} new comment${unreadCount === 1 ? "" : "s"} — click to mark read`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markRead(pr);
                            }}
                            aria-label={`${unreadCount} new comment${unreadCount === 1 ? "" : "s"}, click to mark read`}
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </button>
                        )}
                      </span>
                    </a>
                  );
                })}
              </ul>

              {prs.length === 0 && !isFetching && (
                <div className="pr-empty">No open PRs authored by you.</div>
              )}
            </div>
          )}

          {scope === "all" && (
            <div className="pr-panel">
              <ul className="pr-list">
                {allPrs.map((pr) => {
                  const ageRaw = ageDescription(pr.updatedAt).replace(" AGO", "");
                  return (
                    <a
                      key={pr.number}
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="row pr-row"
                    >
                      <span className="pr-num-cell-row">
                        <span className="pr-num mono">{pr.number}</span>
                      </span>
                      <span className="pr-icon-cell">
                        <PrIcon state={pr.isDraft ? "draft" : "open"} />
                      </span>
                      <span className="pr-content">
                        <span className="pr-title-row">
                          <span className="pr-title">{pr.title}</span>
                          {pr.isDraft && <span className="label label-muted">Draft</span>}
                          {reviewBadge(pr)}
                        </span>
                        <span className="pr-meta">
                          <span>{pr.headRefName}</span>
                        </span>
                      </span>
                      <span className="ci-col">{ciIcon(pr.ciState)}</span>
                      <span className="comment-col mono">
                        <CommentIcon />
                        {String(pr.totalCommentCount).padStart(2, "0")}
                      </span>
                      <span className="age-col mono">{ageRaw}</span>
                      <span />
                    </a>
                  );
                })}
              </ul>

              {allPrs.length === 0 && !isFetching && (
                <div className="pr-empty">No open PRs in repo.</div>
              )}
            </div>
          )}
        </main>
      )}

      {tab === "insights" && data?.viewer && data?.repo && (
        <main className="main">
          <InsightsPanel
            token={token}
            owner={owner}
            repo={repo}
            viewerLogin={data.viewer.login}
            viewerAvatarUrl={data.viewer.avatarUrl}
            repoCreatedAt={data.repo.createdAt}
            intervalMs={POLL_INSIGHTS_MS}
            nextAction={nextAction}
          />
        </main>
      )}

      {tab === "linear" && (
        <main className="main">
          {!settings.linearApiKey ? (
            <div className="empty -rotate-1">
              <p>Configure your Linear API key in Settings to view tickets.</p>
              <button className="btn btn-primary rotate-1" onClick={() => setShowSettings(true)}>
                Open Settings
              </button>
            </div>
          ) : (
            <LinearPanel
              apiKey={settings.linearApiKey}
              teamId={settings.linearTeamId}
              authoredPRs={data?.prs ?? []}
              intervalMs={POLL_LINEAR_MS}
            />
          )}
        </main>
      )}
    </div>
  );
}
