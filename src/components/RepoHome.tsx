import { useQuery } from "@tanstack/react-query";
import { fetchInvolvedPRs } from "../lib/github";
import type { InvolvedPR } from "../lib/github";
import { navTo, hrefFor } from "../lib/router";

interface Props {
  token: string;
  viewerLogin: string;
  intervalMs: number;
}

export function RepoHome({ token, viewerLogin, intervalMs }: Props): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["involvedPRs", viewerLogin],
    queryFn: () => fetchInvolvedPRs(token, viewerLogin),
    refetchInterval: intervalMs,
    enabled: Boolean(token && viewerLogin),
  });

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="main">
        <div className="banner banner-info">Loading your pull requests...</div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="main">
        <div className="error">
          Failed to load PRs: {(error as Error).message}
        </div>
      </div>
    );
  }

  const viewer = data?.viewer ?? { login: viewerLogin, name: null, avatarUrl: "" };
  const prs: InvolvedPR[] = data?.prs ?? [];

  // ── Derived stats ────────────────────────────────────────────────────────

  const totalOpen = prs.length;
  const distinctRepos = new Set(prs.map((pr) => pr.repoNameWithOwner)).size;
  const awaitingPRs = prs.filter((pr) => pr.reviewRequested);
  const awaitingCount = awaitingPRs.length;

  // Group all PRs by repo for the "Your repos" list
  const repoGroups = new Map<string, number>();
  for (const pr of prs) {
    repoGroups.set(pr.repoNameWithOwner, (repoGroups.get(pr.repoNameWithOwner) ?? 0) + 1);
  }
  const sortedRepos = [...repoGroups.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="main">
      {/* ── 1. Header ─────────────────────────────────────────────────── */}
      <div className="home-header">
        {viewer.avatarUrl ? (
          <img
            className="avatar"
            src={viewer.avatarUrl}
            alt={viewer.login}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div className="avatar mono">
            {viewer.login.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="home-welcome">
          <div className="home-welcome-label">Mission Control</div>
          <div className="home-welcome-name">
            Welcome, {viewer.name ?? viewer.login}
          </div>
        </div>
      </div>

      {/* ── 2. Stat strip ─────────────────────────────────────────────── */}
      <div className="home-stat-strip">
        <div className="home-stat">
          <div className="card-label">Open PRs</div>
          <div className="card-value mono">{totalOpen}</div>
        </div>
        <div className="home-stat">
          <div className="card-label">Repos</div>
          <div className="card-value mono">{distinctRepos}</div>
        </div>
        <div className="home-stat">
          <div className="card-label">Awaiting Review</div>
          <div className={`card-value mono${awaitingCount > 0 ? " accent" : ""}`}>
            {awaitingCount}
          </div>
        </div>
      </div>

      {/* ── 3. Awaiting your review ────────────────────────────────────── */}
      {awaitingCount > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div className="section-head">
            <div className="section-title">Awaiting Your Review</div>
            <div className="section-meta">{awaitingCount} PR{awaitingCount !== 1 ? "s" : ""}</div>
          </div>
          <div className="pr-panel">
            <ul className="pr-list">
              {awaitingPRs.map((pr) => {
                const [owner, repo] = pr.repoNameWithOwner.split("/");
                return (
                  <li key={`${pr.repoNameWithOwner}/${pr.number}`} className="home-review-row">
                    <div className="home-review-repo">
                      <button
                        className="btn btn-small"
                        onClick={() => navTo(owner, repo, "prs")}
                        title={`Open ${pr.repoNameWithOwner}`}
                      >
                        {pr.repoNameWithOwner}
                      </button>
                    </div>
                    <div className="pr-content">
                      <div className="pr-title-row">
                        <span className="pr-num mono">#{pr.number}</span>
                        <a
                          className="pr-title"
                          href={pr.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {pr.title}
                        </a>
                      </div>
                      {pr.isDraft && (
                        <span className="label label-muted">Draft</span>
                      )}
                    </div>
                    <div className="home-review-actions">
                      <a
                        className="btn btn-small"
                        href={pr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open PR
                      </a>
                      <a
                        className="btn btn-small btn-ghost"
                        href={hrefFor(owner, repo, "prs")}
                        onClick={(e) => {
                          e.preventDefault();
                          navTo(owner, repo, "prs");
                        }}
                      >
                        Repo
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* ── 4. Your repos ─────────────────────────────────────────────── */}
      <div>
        <div className="section-head">
          <div className="section-title">Your Repos</div>
          <div className="section-meta">{distinctRepos} repo{distinctRepos !== 1 ? "s" : ""} with open PRs</div>
        </div>

        {totalOpen === 0 ? (
          <div className="empty">No open PRs you&apos;re involved in.</div>
        ) : (
          <div className="pr-panel">
            <ul className="pr-list">
              {sortedRepos.map(([repoNameWithOwner, count]) => {
                const [owner, repo] = repoNameWithOwner.split("/");
                return (
                  <li key={repoNameWithOwner}>
                    <button
                      className="home-repo-row row"
                      onClick={() => navTo(owner, repo, "prs")}
                    >
                      <span className="home-repo-name pr-title">
                        {repoNameWithOwner}
                      </span>
                      <span className="tab-count mono">{count}</span>
                      <span className="t-dim home-repo-arrow">→</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
