import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAwaitingReview, fetchMyPRs, type AwaitingReviewPR, type PRSummary } from "./lib/github";
import {
  loadSeen,
  loadSettings,
  saveSeen,
  saveSettings,
  type SeenEntry,
  type SeenMap,
  type Settings,
} from "./lib/storage";
import { setFaviconBadge } from "./lib/favicon";
import { ensureNotifyPermission, notify } from "./lib/notify";
import { useRoute } from "./lib/router";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

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
  const color = state === "draft" ? "#7d8590" : state === "merged" ? "#a371f7" : "#3fb950";
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#3fb950" aria-hidden="true">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#f85149" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="#d29922" aria-hidden="true">
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

export default function App() {
  const route = useRoute();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [seen, setSeen] = useState<SeenMap>(loadSeen);
  const [showSettings, setShowSettings] = useState(false);
  const [scope, setScope] = useState<"authored" | "awaiting">("authored");
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const configured = Boolean(settings.token && settings.owner && settings.repo);

  const { data, error, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["prs", settings.owner, settings.repo],
    queryFn: () => fetchMyPRs(settings.token, settings.owner, settings.repo),
    refetchInterval: settings.intervalSec * 1000,
    enabled: configured,
  });

  const viewer = data?.viewer ?? { login: "", name: null, avatarUrl: "" };
  const login = viewer.login;
  const prs = data?.prs ?? [];

  const awaitingQuery = useQuery({
    queryKey: ["awaiting", settings.owner, settings.repo, viewer.login],
    queryFn: () =>
      fetchAwaitingReview(settings.token, settings.owner, settings.repo, viewer.login),
    refetchInterval: settings.intervalSec * 1000,
    enabled: configured && Boolean(viewer.login) && scope === "awaiting",
  });

  const awaitingPRs: AwaitingReviewPR[] = awaitingQuery.data ?? [];
  const authoredCount = prs.length;
  const awaitingCount = awaitingQuery.data?.length ?? 0;

  const awaitingSummary = useMemo(() => {
    const pendingCount = awaitingPRs.length;
    const blocking3Count = awaitingPRs.filter(
      (p) => !p.isTeamRequest && (p.blockingDays ?? 0) >= 3,
    ).length;
    const nonTeamPRs = awaitingPRs.filter((p) => !p.isTeamRequest && p.blockingDays !== null);
    const oldestDays =
      nonTeamPRs.length > 0 ? Math.max(...nonTeamPRs.map((p) => p.blockingDays!)) : null;
    return { pendingCount, blocking3Count, oldestDays };
  }, [awaitingPRs]);

  useEffect(() => {
    void ensureNotifyPermission();
  }, []);

  useEffect(() => {
    if (!data) return;
    const { prs: fresh } = data;
    const prior = seenRef.current;
    const next: SeenMap = { ...prior };
    const ciFailStates = new Set(["FAILURE", "ERROR"]);

    for (const pr of fresh) {
      const snapshot: SeenEntry = {
        totalComments: pr.totalCommentCount,
        latestReviewSubmittedAt: pr.latestReviewSubmittedAt,
        ciState: pr.ciState,
      };
      if (!(pr.number in prior)) {
        next[pr.number] = snapshot;
        continue;
      }
      const p = prior[pr.number];
      const commentDelta = pr.totalCommentCount - p.totalComments;
      if (commentDelta > 0) {
        notify(
          `PR #${pr.number}: ${commentDelta} new comment${commentDelta === 1 ? "" : "s"}`,
          pr.title,
          pr.url,
        );
      }
      const reviewAdvanced =
        pr.latestReviewSubmittedAt !== null &&
        (p.latestReviewSubmittedAt === null ||
          pr.latestReviewSubmittedAt > p.latestReviewSubmittedAt);
      if (reviewAdvanced) {
        notify(`PR #${pr.number}: new review`, pr.title, pr.url);
      }
      const ciTurnedBad =
        pr.ciState !== null &&
        ciFailStates.has(pr.ciState) &&
        (p.ciState === null || !ciFailStates.has(p.ciState));
      if (ciTurnedBad) {
        notify(`PR #${pr.number}: CI failed`, pr.title, pr.url);
      }
      next[pr.number] = snapshot;
    }
    for (const key of Object.keys(next)) {
      if (!fresh.some((p) => String(p.number) === key)) delete next[Number(key)];
    }

    // Skip no-op writes to avoid triggering re-renders
    const prevSeen = seenRef.current;
    const changed =
      Object.keys(next).length !== Object.keys(prevSeen).length ||
      Object.keys(next).some((k) => {
        const num = Number(k);
        const a = next[num];
        const b = prevSeen[num];
        if (!b) return true;
        return (
          a.totalComments !== b.totalComments ||
          a.latestReviewSubmittedAt !== b.latestReviewSubmittedAt ||
          a.ciState !== b.ciState
        );
      });

    if (changed) {
      setSeen(next);
      saveSeen(next);
    }
  }, [data?.prs, dataUpdatedAt]);

  const unreadByPr = useMemo(() => {
    const ciFailStates = new Set(["FAILURE", "ERROR"]);
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
        ciFailStates.has(pr.ciState) &&
        (prior.ciState === null || !ciFailStates.has(prior.ciState));
      const unread = commentDelta > 0 || reviewAdvanced || ciTurnedBad;
      map[pr.number] = { unread, count: commentDelta };
      total += commentDelta;
    }
    return { map, total };
  }, [prs, seen]);

  useEffect(() => {
    setFaviconBadge(unreadByPr.total);
  }, [unreadByPr.total]);

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

  const errorMessage = error instanceof Error ? error.message : error ? String(error) : null;
  const lastFetch = dataUpdatedAt > 0 ? dataUpdatedAt : null;
  const tabPrsCount = authoredCount + awaitingCount;

  return (
    <div className="app">
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              <PrIcon state="open" />
            </span>
            <span className="brand-text">PR Dashboard</span>
            {login && <span className="brand-user">@{login}</span>}
          </div>
          <div className="topbar-actions">
            {lastFetch && (
              <span className="ts">Updated {relativeTime(new Date(lastFetch).toISOString())}</span>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => void refetch()}
              disabled={!configured || isFetching}
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
            <button className="btn btn-ghost" onClick={() => setShowSettings(!showSettings)}>
              Settings
            </button>
          </div>
        </div>
        {configured && (
          <div className="subbar">
            <span className="repo-crumb">
              {settings.owner}
              <span className="slash">/</span>
              <strong>{settings.repo}</strong>
            </span>
          </div>
        )}
        <nav className="tabs">
          <div className="tabs-row">
            <a
              href="#/prs"
              className={`tab${route === "prs" ? " tab-nav-active" : ""}`}
              aria-current={route === "prs" ? "page" : undefined}
            >
              PRS <span className="tab-count">{tabPrsCount || ""}</span>
            </a>
            <a
              href="#/activity"
              className={`tab${route === "activity" ? " tab-nav-active" : ""}`}
              aria-current={route === "activity" ? "page" : undefined}
            >
              ACTIVITY
            </a>
            <a
              href="#/insights"
              className={`tab${route === "insights" ? " tab-nav-active" : ""}`}
              aria-current={route === "insights" ? "page" : undefined}
            >
              INSIGHTS
            </a>
            <a
              href="#/linear"
              className={`tab${route === "linear" ? " tab-nav-active" : ""}`}
              aria-current={route === "linear" ? "page" : undefined}
            >
              LINEAR
            </a>
          </div>
        </nav>
      </header>

      {route === "prs" ? (
        <main className="main">
          {errorMessage && <div className="error">{errorMessage}</div>}

          {!configured && (
            <div className="empty">
              <p>Configure your GitHub PAT and target repo to start.</p>
              <button className="btn btn-primary" onClick={() => setShowSettings(true)}>
                Open settings
              </button>
            </div>
          )}

          {configured && (
            <>
              <div className="scope-toggle">
                <button
                  className="scope-btn"
                  aria-pressed={scope === "authored"}
                  onClick={() => setScope("authored")}
                >
                  Authored <span className="scope-count">{authoredCount}</span>
                </button>
                <button
                  className="scope-btn"
                  aria-pressed={scope === "awaiting"}
                  onClick={() => setScope("awaiting")}
                >
                  Awaiting your review <span className="scope-count">{awaitingCount}</span>
                </button>
              </div>

              {scope === "authored" && (
                <div className="pr-panel">
                  <div className="pr-panel-header">
                    <div className="filter-tabs">
                      <span className="tab tab-active">
                        <PrIcon state="open" />
                        <strong>{prs.length}</strong> Open
                      </span>
                      <span className="tab tab-muted">
                        <CheckIcon /> Closed
                      </span>
                    </div>
                    <div className="filter-spacers">
                      <span className="filter-stub">
                        Newest <Caret />
                      </span>
                    </div>
                  </div>

                  <ul className="pr-list">
                    {prs.map((pr) => {
                      const unreadEntry = unreadByPr.map[pr.number];
                      const isUnread = unreadEntry?.unread ?? false;
                      const unreadCount = unreadEntry?.count ?? 0;
                      const created = relativeTime(pr.updatedAt);
                      return (
                        <li key={pr.number} className={`pr-row ${isUnread ? "is-unread" : ""}`}>
                          <div className="pr-icon-col">
                            <PrIcon state={pr.isDraft ? "draft" : "open"} />
                          </div>
                          <div className="pr-body">
                            <div className="pr-title-line">
                              <a
                                className="pr-link"
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => handlePrClick(e, pr)}
                              >
                                {pr.title}
                              </a>
                              {pr.isDraft && <span className="label label-muted">Draft</span>}
                              {reviewBadge(pr)}
                            </div>
                            <div className="pr-meta-line">
                              <span className="meta">
                                {settings.owner}/{settings.repo}#{pr.number}
                              </span>
                              <span className="meta-sep">·</span>
                              <span className="meta">opened {created}</span>
                              {pr.ciState && (
                                <>
                                  <span className="meta-sep">·</span>
                                  <span className="meta-ci">{ciIcon(pr.ciState)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="pr-right">
                            {unreadCount > 0 && (
                              <button
                                className="unread-bubble"
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
                            {pr.totalCommentCount > 0 && (
                              <span className="comment-count" title="Total comments">
                                <CommentIcon />
                                <span>{pr.totalCommentCount}</span>
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {prs.length === 0 && !isFetching && (
                    <div className="pr-empty">No open PRs authored by you.</div>
                  )}
                </div>
              )}

              {scope === "awaiting" && awaitingQuery.data && (
                <div className="summary-bar">
                  <div className="summary-cell">
                    <div className="summary-label">PENDING</div>
                    <div
                      className={`summary-value mono ${awaitingSummary.pendingCount > 0 ? "accent" : ""}`}
                    >
                      {String(awaitingSummary.pendingCount).padStart(2, "0")}
                    </div>
                  </div>
                  <div className="summary-cell">
                    <div className="summary-label">BLOCKING ≥ 3D</div>
                    <div
                      className={`summary-value mono ${awaitingSummary.blocking3Count > 0 ? "danger" : ""}`}
                    >
                      {String(awaitingSummary.blocking3Count).padStart(2, "0")}
                    </div>
                  </div>
                  <div className="summary-cell">
                    <div className="summary-label">AVG TURNAROUND</div>
                    <div className="summary-value mono">—</div>
                  </div>
                  <div className="summary-cell">
                    <div className="summary-label">OLDEST</div>
                    <div
                      className={`summary-value mono ${awaitingSummary.oldestDays !== null && awaitingSummary.oldestDays >= 5 ? "danger" : ""}`}
                    >
                      {awaitingSummary.oldestDays !== null ? (
                        <>
                          {awaitingSummary.oldestDays}
                          <span style={{ fontSize: "11px", color: "var(--muted)", marginLeft: "4px" }}>
                            D
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                </div>
              )}

              {scope === "awaiting" && (
                <div className="pr-panel">
                  <ul className="pr-list">
                    {awaitingQuery.isFetching && !awaitingQuery.data && (
                      <li className="pr-row pr-row-loading">
                        <span>Loading…</span>
                      </li>
                    )}
                    {awaitingPRs.map((pr) => {
                      const isBlocking =
                        !pr.isTeamRequest && pr.blockingDays !== null && pr.blockingDays >= 3;
                      const created = relativeTime(pr.updatedAt);
                      return (
                        <li
                          key={pr.number}
                          className={`pr-row${isBlocking ? " is-blocking" : ""}`}
                        >
                          <div className="pr-icon-col">
                            <PrIcon state={pr.isDraft ? "draft" : "open"} />
                          </div>
                          <div className="pr-body">
                            <div className="pr-title-line">
                              <a
                                className="pr-link"
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {pr.title}
                              </a>
                              {pr.isDraft && <span className="label label-muted">Draft</span>}
                              {isBlocking && (
                                <span className="tag tag-blocking">
                                  ◆ BLOCKING {pr.blockingDays}D
                                </span>
                              )}
                            </div>
                            <div className="pr-meta-line">
                              <span className="meta">
                                {settings.owner}/{settings.repo}#{pr.number}
                              </span>
                              <span className="meta-sep">·</span>
                              <span className="meta">updated {created}</span>
                              {pr.ciState && (
                                <>
                                  <span className="meta-sep">·</span>
                                  <span className="meta-ci">{ciIcon(pr.ciState)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="pr-right">
                            {pr.totalCommentCount > 0 && (
                              <span className="comment-count" title="Total comments">
                                <CommentIcon />
                                <span>{pr.totalCommentCount}</span>
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {!awaitingQuery.isFetching && awaitingPRs.length === 0 && (
                    <div className="pr-empty">Nothing awaiting your review.</div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      ) : (
        <main className="main">
          <p>Coming soon</p>
        </main>
      )}
    </div>
  );
}

function Caret() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z" />
    </svg>
  );
}
