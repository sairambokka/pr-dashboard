import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMyPRs, type PRSummary } from "./lib/github";
import {
  loadSeen,
  loadSettings,
  saveSeen,
  saveSettings,
  type SeenMap,
  type Settings,
} from "./lib/storage";
import { setFaviconBadge } from "./lib/favicon";
import { ensureNotifyPermission, notify } from "./lib/notify";
import "./App.css";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function reviewLabel(d: PRSummary["reviewDecision"]): {
  text: string;
  className: string;
} {
  switch (d) {
    case "APPROVED":
      return { text: "Approved", className: "pill pill-approved" };
    case "CHANGES_REQUESTED":
      return { text: "Changes requested", className: "pill pill-changes" };
    case "REVIEW_REQUIRED":
      return { text: "Review required", className: "pill pill-pending" };
    default:
      return { text: "No review", className: "pill pill-muted" };
  }
}

function ciDot(state: PRSummary["ciState"]): { className: string; label: string } {
  switch (state) {
    case "SUCCESS":
      return { className: "ci ci-success", label: "CI passing" };
    case "FAILURE":
    case "ERROR":
      return { className: "ci ci-fail", label: "CI failing" };
    case "PENDING":
    case "EXPECTED":
      return { className: "ci ci-pending", label: "CI pending" };
    default:
      return { className: "ci ci-none", label: "No CI" };
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [prs, setPrs] = useState<PRSummary[]>([]);
  const [seen, setSeen] = useState<SeenMap>(loadSeen);
  const [login, setLogin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const seenRef = useRef(seen);
  seenRef.current = seen;

  const configured = settings.token && settings.owner && settings.repo;

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const { login: viewer, prs: fresh } = await fetchMyPRs(
        settings.token,
        settings.owner,
        settings.repo,
      );
      setLogin(viewer);
      setPrs(fresh);
      setLastFetch(Date.now());

      const prior = seenRef.current;
      const next: SeenMap = { ...prior };

      for (const pr of fresh) {
        if (!(pr.number in prior)) {
          next[pr.number] = pr.totalCommentCount;
          continue;
        }
        const delta = pr.totalCommentCount - prior[pr.number];
        if (delta > 0) {
          notify(
            `PR #${pr.number}: ${delta} new comment${delta === 1 ? "" : "s"}`,
            pr.title,
            pr.url,
          );
        }
      }

      for (const key of Object.keys(next)) {
        if (!fresh.some((p) => String(p.number) === key)) delete next[Number(key)];
      }

      setSeen(next);
      saveSeen(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [configured, settings.token, settings.owner, settings.repo]);

  useEffect(() => {
    if (!configured) return;
    void refresh();
    const id = setInterval(refresh, settings.intervalSec * 1000);
    return () => clearInterval(id);
  }, [configured, settings.intervalSec, refresh]);

  useEffect(() => {
    void ensureNotifyPermission();
  }, []);

  const unreadByPr = useMemo(() => {
    const map: Record<number, number> = {};
    let total = 0;
    for (const pr of prs) {
      const baseline = seen[pr.number] ?? pr.totalCommentCount;
      const u = Math.max(0, pr.totalCommentCount - baseline);
      map[pr.number] = u;
      total += u;
    }
    return { map, total };
  }, [prs, seen]);

  useEffect(() => {
    setFaviconBadge(unreadByPr.total);
  }, [unreadByPr.total]);

  const markRead = (prNumber: number, currentCount: number) => {
    const next = { ...seenRef.current, [prNumber]: currentCount };
    setSeen(next);
    saveSeen(next);
  };

  const markAllRead = () => {
    const next: SeenMap = {};
    for (const pr of prs) next[pr.number] = pr.totalCommentCount;
    setSeen(next);
    saveSeen(next);
  };

  const handlePrClick = (e: React.MouseEvent<HTMLAnchorElement>, pr: PRSummary) => {
    e.preventDefault();
    markRead(pr.number, pr.totalCommentCount);
    window.open(pr.url, "_blank", "noopener,noreferrer");
  };

  const totalUnread = unreadByPr.total;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>PR Dashboard</h1>
          {totalUnread > 0 && <span className="total-unread">{totalUnread}</span>}
          {login && <span className="login">@{login}</span>}
          {configured && (
            <span className="repo-tag">
              {settings.owner}/{settings.repo}
            </span>
          )}
        </div>
        <div className="header-right">
          {lastFetch && (
            <span className="muted">
              Updated {relativeTime(new Date(lastFetch).toISOString())} ago
            </span>
          )}
          <button onClick={refresh} disabled={!configured || loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button onClick={markAllRead} disabled={!totalUnread}>
            Mark all read
          </button>
          <button onClick={() => setShowSettings(!showSettings)}>Settings</button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {error && <div className="error">{error}</div>}

      {!configured && !showSettings && (
        <div className="empty">
          <p>Configure your GitHub PAT and target repo to start.</p>
          <button onClick={() => setShowSettings(true)}>Open settings</button>
        </div>
      )}

      <ul className="pr-list">
        {prs.map((pr) => {
          const r = reviewLabel(pr.reviewDecision);
          const ci = ciDot(pr.ciState);
          const unread = unreadByPr.map[pr.number] ?? 0;
          return (
            <li
              key={pr.number}
              className={`pr-row ${pr.isDraft ? "draft" : ""} ${unread > 0 ? "has-unread" : ""}`}
            >
              <a
                className="pr-link"
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handlePrClick(e, pr)}
                onAuxClick={(e) => {
                  if (e.button === 1) markRead(pr.number, pr.totalCommentCount);
                }}
              >
                <span className="pr-bubble-slot">
                  {unread > 0 ? (
                    <span className="unread-bubble" title={`${unread} new`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : (
                    <span className={ci.className} title={ci.label} />
                  )}
                </span>
                <span className="pr-num">#{pr.number}</span>
                <span className="pr-title">{pr.title}</span>
                {pr.isDraft && <span className="pill pill-muted">Draft</span>}
                <span className={r.className}>{r.text}</span>
                <span className="pr-comments">
                  {pr.totalCommentCount}{" "}
                  {pr.totalCommentCount === 1 ? "comment" : "comments"}
                </span>
                <span className="muted pr-time">{relativeTime(pr.updatedAt)}</span>
                <button
                  className="mark-read-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    markRead(pr.number, pr.totalCommentCount);
                  }}
                  disabled={unread === 0}
                  title="Mark as read"
                  aria-label="Mark as read"
                >
                  ✓
                </button>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  return (
    <div className="settings">
      <h2>Settings</h2>
      <label>
        GitHub Personal Access Token
        <input
          type="password"
          value={draft.token}
          onChange={(e) => setDraft({ ...draft, token: e.target.value })}
          placeholder="github_pat_…"
          autoComplete="off"
        />
        <small>
          Fine-grained PAT with <code>repo</code> read scope. Stored only in your browser
          localStorage.
        </small>
      </label>
      <label>
        Repo owner
        <input
          type="text"
          value={draft.owner}
          onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          placeholder="e.g. corca-ai"
        />
      </label>
      <label>
        Repo name
        <input
          type="text"
          value={draft.repo}
          onChange={(e) => setDraft({ ...draft, repo: e.target.value })}
          placeholder="e.g. corca-app"
        />
      </label>
      <label>
        Poll interval (seconds)
        <input
          type="number"
          min={15}
          value={draft.intervalSec}
          onChange={(e) =>
            setDraft({ ...draft, intervalSec: Math.max(15, Number(e.target.value) || 60) })
          }
        />
      </label>
      <div className="settings-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => onSave(draft)}>
          Save
        </button>
      </div>
    </div>
  );
}
