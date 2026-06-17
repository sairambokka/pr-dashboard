import { useState, useEffect } from "react";
import type { JSX } from "react";

interface Props {
  onSignIn: () => void;
}

const FEATURES: { label: string; body: string; rotate: string }[] = [
  {
    label: "Cross-Repo Overview",
    body: "One inbox for every open PR across all your GitHub repositories. No more tab-hopping.",
    rotate: "rotate-1",
  },
  {
    label: "Awaiting-Your-Review Queue",
    body: "PRs that need your attention bubble to the top — filtered from team noise.",
    rotate: "-rotate-1",
  },
  {
    label: "CI + Review Status",
    body: "Green check, red X, or pending dot — CI and approval state at a glance on every row.",
    rotate: "rotate-1",
  },
  {
    label: "Cycle-Time Insights",
    body: "Track open → merged time per repo and spot where PRs stall in your workflow.",
    rotate: "-rotate-1",
  },
];

const PAIN_POINTS: { label: string; body: string; rotate: string }[] = [
  {
    label: "Tab soup",
    body: "12 repos. 12 tabs. Constant alt-tab roulette just to see what's open.",
    rotate: "rotate-1",
  },
  {
    label: "Buried notifications",
    body: "GitHub's notification bell is a black hole. Review requests drown in CI spam.",
    rotate: "-rotate-1",
  },
  {
    label: "CI failures, discovered late",
    body: "You find out the build broke when your teammate pings you — 3 hours later.",
    rotate: "rotate-1",
  },
  {
    label: "Comments you never saw",
    body: "Someone replied to your thread yesterday. You still haven't seen it.",
    rotate: "-rotate-1",
  },
];

// ── Live feed data pool ────────────────────────────────────────────────────

type CiState = "green" | "red" | "pending";
type ReviewState = "approved" | "changes" | "review";

interface FakePr {
  num: number;
  title: string;
  ci: CiState;
  review: ReviewState;
  age: string;
  unread: number | null;
}

const PR_POOL: FakePr[] = [
  { num: 482, title: "Fix auth token refresh logic",      ci: "green",   review: "approved", age: "2d",  unread: 3    },
  { num: 479, title: "Add rate limiting middleware",       ci: "red",     review: "changes",  age: "4d",  unread: null },
  { num: 476, title: "Migrate to Postgres 16",            ci: "pending", review: "review",   age: "6d",  unread: null },
  { num: 471, title: "Bump openssl to 3.3.1",             ci: "green",   review: "review",   age: "12d", unread: null },
  { num: 468, title: "Refactor webhook dispatcher",       ci: "green",   review: "approved", age: "1d",  unread: 1    },
  { num: 465, title: "Add OpenTelemetry tracing",         ci: "pending", review: "review",   age: "3d",  unread: null },
];

const INITIAL_ROWS = PR_POOL.slice(0, 4);

// Safe reduced-motion check (client-only Vite; window always exists at runtime,
// but guard against any SSR-like initialisation path just in case).
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Ticker token list ──────────────────────────────────────────────────────

const TICKER_TOKENS = [
  { text: "#482",             dot: "green"   },
  { text: "✓ MERGED",        dot: null       },
  { text: "·",               dot: null       },
  { text: "#479",             dot: "red"     },
  { text: "✗ CI FAILED",     dot: null       },
  { text: "·",               dot: null       },
  { text: "#476",             dot: "pending" },
  { text: "⏳ PENDING REVIEW", dot: null     },
  { text: "·",               dot: null       },
  { text: "#471",             dot: "green"   },
  { text: "✓ APPROVED",      dot: null       },
  { text: "·",               dot: null       },
  { text: "acme/api",         dot: null       },
  { text: "·",               dot: null       },
  { text: "octocat/sandbox",  dot: null       },
  { text: "·",               dot: null       },
  { text: "#455",             dot: "red"     },
  { text: "✗ CONFLICTS",     dot: null       },
  { text: "·",               dot: null       },
  { text: "#468",             dot: "green"   },
  { text: "✓ MERGED",        dot: null       },
  { text: "·",               dot: null       },
  { text: "acme/web",         dot: null       },
  { text: "·",               dot: null       },
  { text: "#465",             dot: "pending" },
  { text: "⏳ IN REVIEW",    dot: null       },
  { text: "·",               dot: null       },
];

// ── Component ─────────────────────────────────────────────────────────────

export function LandingPage({ onSignIn }: Props): JSX.Element {
  // Live feed state — newKey identifies which row just entered (drives CSS animation)
  const [feedRows, setFeedRows] = useState<FakePr[]>(INITIAL_ROWS);
  const [newKey, setNewKey]     = useState<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return; // static list for reduced-motion users

    let currentIdx = 4; // tracks next pool position outside React state
    let clearAnimId: ReturnType<typeof setTimeout> | null = null;

    const id = setInterval(() => {
      const incoming = PR_POOL[currentIdx % PR_POOL.length];
      currentIdx = (currentIdx + 1) % PR_POOL.length;

      setNewKey(incoming.num);
      setFeedRows((rows) => [incoming, ...rows.slice(0, 3)]);

      // Clear the "new-row" highlight class after slide-in finishes (~250ms)
      if (clearAnimId !== null) clearTimeout(clearAnimId);
      clearAnimId = setTimeout(() => setNewKey(null), 300);
    }, 3500);

    return () => {
      clearInterval(id);
      if (clearAnimId !== null) clearTimeout(clearAnimId);
    };
  }, []);

  return (
    <div className="landing-page">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-row">
          <span className="brand">
            <span className="brand-mark" />
            PR Dashboard
          </span>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner landing-hero-two-col">

          {/* Left — copy */}
          <div className="landing-hero-copy">
            <div className="landing-eyebrow section-title">
              GITHUB, MINUS THE NOISE
            </div>
            <h1 className="landing-headline">
              <span className="landing-headline-line landing-anim-line-1">
                Stop alt-tabbing
              </span>
              <br />
              <span className="landing-headline-line landing-anim-line-2">
                through GitHub.
              </span>
              <br />
              <span className="landing-headline-line landing-headline-turn landing-anim-line-3">
                You have one screen now.
              </span>
            </h1>
            <p className="landing-subhead landing-anim-subhead">
              Built for devs juggling 5+ repos. One view shows every PR that
              needs you — what's failing CI, what's waiting on your review,
              what's been sitting there rotting for a week.
            </p>
            <button
              type="button"
              className="btn btn-primary landing-cta landing-anim-cta"
              onClick={onSignIn}
            >
              Sign in with GitHub
            </button>
            <p className="landing-hero-trust landing-anim-trust">
              1 auth · every repo · ~0 config · token never leaves your browser
            </p>
          </div>

          {/* Right — live animated mock */}
          <div className="landing-hero-mock" aria-hidden="true">
            <div className="landing-mock-block landing-hero-mock-block">

              {/* Stat strip */}
              <div className="landing-mock-label card-label">Mission control</div>
              <div className="landing-mock-statstrip">
                <span className="landing-mock-stat">12 <span className="landing-mock-stat-unit">open prs</span></span>
                <span className="landing-mock-sep">·</span>
                <span className="landing-mock-stat">5 <span className="landing-mock-stat-unit">repos</span></span>
                <span className="landing-mock-sep">·</span>
                <span className="landing-mock-stat landing-mock-stat-accent">3 <span className="landing-mock-stat-unit">awaiting you</span></span>
              </div>

              {/* PR live-feed list — fixed height for 4 rows prevents layout jump */}
              <div className="landing-mock-prlist landing-mock-livefeed">
                {feedRows.map((pr) => (
                  <div
                    key={pr.num}
                    className={[
                      "landing-mock-pr-row",
                      pr.unread ? "landing-mock-pr-unread" : "",
                      pr.num === newKey ? "landing-mock-row-live-enter" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <span className="landing-mock-pr-num">{pr.num}</span>
                    <span
                      className={[
                        "landing-mock-ci",
                        pr.ci === "green"   ? "landing-mock-ci-green"   : "",
                        pr.ci === "red"     ? "landing-mock-ci-red"     : "",
                        pr.ci === "pending" ? "landing-mock-ci-pending" : "",
                        pr.num === 479 && pr.ci === "red" ? "landing-mock-ci-flip" : "",
                      ].filter(Boolean).join(" ")}
                    >●</span>
                    <span className="landing-mock-pr-title">{pr.title}</span>
                    {pr.review === "approved" && <span className="badge badge-approved">Approved</span>}
                    {pr.review === "changes"  && <span className="badge badge-changes">Changes</span>}
                    {pr.review === "review"   && <span className="badge">Review</span>}
                    <span className="landing-mock-age">{pr.age}</span>
                    {pr.unread ? (
                      <span className="bubble landing-bubble-anim">
                        <span className="landing-bubble-a">{pr.unread}</span>
                        <span className="landing-bubble-b">0</span>
                      </span>
                    ) : (
                      <span className="landing-mock-no-badge t-dim">—</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── PR Ticker band — between hero and problem ── */}
      <section className="landing-ticker" aria-hidden="true">
        <div className="landing-ticker-track">
          {/* Duplicate the token list twice for seamless loop */}
          {[0, 1].map((copy) => (
            <span key={copy} className="landing-ticker-set" aria-hidden={copy === 1 ? "true" : undefined}>
              {TICKER_TOKENS.map((token, i) => (
                <span key={i} className="landing-ticker-item">
                  {token.dot && (
                    <span
                      className={[
                        "landing-ticker-dot",
                        token.dot === "green"   ? "landing-ticker-dot-green"   : "",
                        token.dot === "red"     ? "landing-ticker-dot-red"     : "",
                        token.dot === "pending" ? "landing-ticker-dot-pending" : "",
                      ].filter(Boolean).join(" ")}
                    >●</span>
                  )}
                  {token.text}
                </span>
              ))}
            </span>
          ))}
        </div>
      </section>

      {/* ── Problem section ── */}
      <section className="landing-problem">
        <div className="landing-problem-inner">
          <div className="landing-features-heading section-head">
            <span className="section-title rotate-1">The problem</span>
          </div>
          <ul className="landing-problem-grid">
            {PAIN_POINTS.map(({ label, body, rotate }) => (
              <li key={label} className={`landing-feature-card card ${rotate}`}>
                <div className="card-label">{label}</div>
                <p className="landing-feature-body">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Solution section ── */}
      <section className="landing-solution">
        <div className="landing-solution-inner">
          <div className="landing-features-heading section-head">
            <span className="section-title -rotate-1">How PR Dashboard fixes it</span>
          </div>
          <p className="landing-solution-desc">
            One unified view replaces the tab soup. CI dots, review pills, and
            unread badges are on every row — no clicks required. New comments
            surface as red deltas the moment you open the page.
          </p>

          {/* ── App mockups ── */}
          <div className="landing-mock-wrap" aria-hidden="true">

            {/* Mockup 1 — Mission control stat strip + repo list */}
            <div className="landing-mock-block">
              <div className="landing-mock-label card-label">Mission control</div>
              <div className="landing-mock-statstrip">
                <span className="landing-mock-stat">12 <span className="landing-mock-stat-unit">open prs</span></span>
                <span className="landing-mock-sep">·</span>
                <span className="landing-mock-stat">5 <span className="landing-mock-stat-unit">repos</span></span>
                <span className="landing-mock-sep">·</span>
                <span className="landing-mock-stat landing-mock-stat-accent">3 <span className="landing-mock-stat-unit">awaiting you</span></span>
              </div>
              <div className="landing-mock-repolist">
                <div className="landing-mock-repo-row">
                  <span className="landing-mock-repo-name">acme/api</span>
                  <span className="tab-count">4</span>
                </div>
                <div className="landing-mock-repo-row">
                  <span className="landing-mock-repo-name">acme/web</span>
                  <span className="tab-count">3</span>
                </div>
                <div className="landing-mock-repo-row">
                  <span className="landing-mock-repo-name">octocat/sandbox</span>
                  <span className="tab-count">5</span>
                </div>
              </div>
            </div>

            {/* Mockup 2 — PR list */}
            <div className="landing-mock-block">
              <div className="landing-mock-label card-label">PR list — acme/api</div>
              <div className="landing-mock-prlist">

                <div className="landing-mock-pr-row landing-mock-pr-unread">
                  <span className="landing-mock-pr-num">#482</span>
                  <span className="landing-mock-ci landing-mock-ci-green" title="CI pass">●</span>
                  <span className="landing-mock-pr-title">Fix auth token refresh logic</span>
                  <span className="badge badge-approved">Approved</span>
                  <span className="landing-mock-age">2d</span>
                  <span className="bubble">3</span>
                </div>

                <div className="landing-mock-pr-row">
                  <span className="landing-mock-pr-num">#479</span>
                  <span className="landing-mock-ci landing-mock-ci-red" title="CI fail">●</span>
                  <span className="landing-mock-pr-title">Add rate limiting middleware</span>
                  <span className="badge badge-changes">Changes</span>
                  <span className="landing-mock-age">4d</span>
                  <span className="landing-mock-no-badge t-dim">—</span>
                </div>

                <div className="landing-mock-pr-row">
                  <span className="landing-mock-pr-num">#476</span>
                  <span className="landing-mock-ci landing-mock-ci-pending" title="CI pending">●</span>
                  <span className="landing-mock-pr-title">Migrate to Postgres 16</span>
                  <span className="badge">Review</span>
                  <span className="landing-mock-age">6d</span>
                  <span className="landing-mock-no-badge t-dim">—</span>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Notifications spotlight ── */}
      <section className="landing-spotlight">
        <div className="landing-spotlight-inner">

          <div className="landing-features-heading section-head">
            <span className="section-title rotate-1">Never miss a comment</span>
          </div>

          <p className="landing-spotlight-lead">
            A comment landed three hours ago. On a repo you forgot you had a PR in.
            You already know — it&apos;s badged on your tab, it pinged your desktop,
            and it&apos;s waiting as a red delta when you open the dashboard.
          </p>

          <div className="landing-spotlight-mechanisms">

            {/* ── Mechanism 1: Unread delta ── */}
            <div className="landing-spotlight-card card rotate-1">
              <div className="card-label">Unread delta</div>
              <p className="landing-spotlight-card-desc">
                Every PR row shows exactly how many new comments arrived since you
                last looked. Click the bubble to mark it read — it clears instantly.
              </p>
              <div className="landing-spotlight-mock" aria-hidden="true">
                <div className="landing-mock-prlist">
                  <div className="landing-mock-pr-row landing-mock-pr-unread">
                    <span className="landing-mock-pr-num">482</span>
                    <span className="landing-mock-ci landing-mock-ci-green">●</span>
                    <span className="landing-mock-pr-title">Fix auth token refresh logic</span>
                    <span className="badge badge-approved">Approved</span>
                    <span className="landing-mock-age">2d</span>
                    <span className="bubble landing-bubble-anim">
                      <span className="landing-bubble-a">3</span>
                      <span className="landing-bubble-b">0</span>
                    </span>
                  </div>
                  <div className="landing-mock-pr-row">
                    <span className="landing-mock-pr-num">479</span>
                    <span className="landing-mock-ci landing-mock-ci-red">●</span>
                    <span className="landing-mock-pr-title">Add rate limiting middleware</span>
                    <span className="badge badge-changes">Changes</span>
                    <span className="landing-mock-age">4d</span>
                    <span className="landing-mock-no-badge t-dim">—</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Mechanism 2: Desktop push ── */}
            <div className="landing-spotlight-card card -rotate-1">
              <div className="card-label">Desktop push</div>
              <p className="landing-spotlight-card-desc">
                When you&apos;re in another tab, a native OS notification fires for new
                comments, submitted reviews, and CI failures. Click it to jump straight
                to that PR. Requires one-time browser permission.
              </p>
              <div className="landing-spotlight-mock" aria-hidden="true">
                <div className="landing-notif-card">
                  <div className="landing-notif-header">
                    <span className="landing-notif-icon" aria-hidden="true">
                      <span className="brand-mark" />
                    </span>
                    <span className="landing-notif-app">PR Dashboard</span>
                    <span className="landing-notif-time">now</span>
                  </div>
                  <div className="landing-notif-title">PR #482 · 3 new comments</div>
                  <div className="landing-notif-body">Fix auth token refresh logic — acme/api</div>
                </div>
              </div>
            </div>

            {/* ── Mechanism 3: Favicon badge ── */}
            <div className="landing-spotlight-card card rotate-1">
              <div className="card-label">Favicon badge</div>
              <p className="landing-spotlight-card-desc">
                The browser-tab favicon gets a red count bubble showing your total
                unread across all PRs — capped at 9+ so you always know at a glance,
                even when the dashboard isn&apos;t your focused tab.
              </p>
              <div className="landing-spotlight-mock" aria-hidden="true">
                <div className="landing-favicon-browser">
                  <div className="landing-favicon-bar">
                    <div className="landing-favicon-tab landing-favicon-tab-active">
                      <div className="landing-favicon-icon-wrap">
                        <span className="landing-favicon-icon" />
                        <span className="landing-favicon-badge">3</span>
                      </div>
                      <span className="landing-favicon-tab-label">PR Dashboard</span>
                    </div>
                    <div className="landing-favicon-tab">
                      <span className="landing-favicon-tab-label t-dim">GitHub</span>
                    </div>
                    <div className="landing-favicon-tab">
                      <span className="landing-favicon-tab-label t-dim">Slack</span>
                    </div>
                  </div>
                  <div className="landing-favicon-url-bar">
                    <span className="landing-favicon-url t-dim">pr-dashboard.app</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Linear spotlight ── */}
      <section className="landing-linear">
        <div className="landing-linear-inner">

          <div className="landing-features-heading section-head">
            <span className="section-title -rotate-1">Your tickets, next to your code</span>
          </div>

          <p className="landing-linear-lead">
            The PR and the ticket it closes, side by side. Linear status, priority, and cycle
            — surfaced on the dashboard by matching the issue ID in your PR title. No tab to
            Linear, no copy-paste. Paste your Linear API key in Settings once; everything
            else is automatic.
          </p>

          <div className="landing-linear-blocks">

            {/* ── Block 1: PR ↔ ticket link ── */}
            <div className="landing-spotlight-card card rotate-1">
              <div className="card-label">PR linked to ticket</div>
              <p className="landing-spotlight-card-desc">
                A PR titled &ldquo;ENG-482 Fix auth token refresh&rdquo; automatically links to
                issue ENG-482. The ticket&apos;s state and priority appear right on the PR row
                — no manual linking, no extra clicks.
              </p>
              <div className="landing-spotlight-mock" aria-hidden="true">
                <div className="landing-mock-prlist">
                  <div className="landing-mock-pr-row landing-mock-pr-unread">
                    <span className="landing-mock-pr-num">482</span>
                    <span className="landing-mock-ci landing-mock-ci-green">●</span>
                    <span className="landing-mock-pr-title">ENG-482 Fix auth token refresh</span>
                    <span className="badge badge-approved">Approved</span>
                    <span className="landing-mock-age">2d</span>
                    <span className="bubble">3</span>
                  </div>
                  <div className="landing-linear-chip-row">
                    <span className="landing-linear-chip">
                      <span className="landing-linear-chip-id">ENG-482</span>
                      <span className="landing-linear-state-dot landing-linear-state-progress" />
                      <span className="landing-linear-chip-state">In Progress</span>
                      <span className="landing-linear-chip-priority">P1</span>
                    </span>
                  </div>
                  <div className="landing-mock-pr-row">
                    <span className="landing-mock-pr-num">479</span>
                    <span className="landing-mock-ci landing-mock-ci-red">●</span>
                    <span className="landing-mock-pr-title">Add rate limiting middleware</span>
                    <span className="badge badge-changes">Changes</span>
                    <span className="landing-mock-age">4d</span>
                    <span className="landing-mock-no-badge t-dim">—</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Block 2: Assigned issues ── */}
            <div className="landing-spotlight-card card -rotate-1">
              <div className="card-label">Assigned issues</div>
              <p className="landing-spotlight-card-desc">
                See all Linear issues assigned to you — filtered to your user — with
                identifier, title, workflow state, and priority. Scope by team ID or
                pull everything in at once.
              </p>
              <div className="landing-spotlight-mock" aria-hidden="true">
                <div className="landing-linear-issue-list">
                  <div className="landing-linear-issue">
                    <span className="landing-linear-issue-id">ENG-482</span>
                    <span className="landing-linear-issue-title">Fix auth token refresh</span>
                    <span className="landing-linear-state-pill landing-linear-state-pill-progress">In Progress</span>
                  </div>
                  <div className="landing-linear-issue">
                    <span className="landing-linear-issue-id">ENG-475</span>
                    <span className="landing-linear-issue-title">Add OpenTelemetry spans</span>
                    <span className="landing-linear-state-pill landing-linear-state-pill-review">In Review</span>
                  </div>
                  <div className="landing-linear-issue">
                    <span className="landing-linear-issue-id">ENG-461</span>
                    <span className="landing-linear-issue-title">Migrate to Postgres 16</span>
                    <span className="landing-linear-state-pill landing-linear-state-pill-todo">Todo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Block 3: Cycle progress ── */}
            <div className="landing-spotlight-card card rotate-1">
              <div className="card-label">Active cycle</div>
              <p className="landing-spotlight-card-desc">
                The current cycle&apos;s progress lives at the top of the Linear tab —
                done, in-progress, and todo counts with a burndown bar so you know
                exactly where the sprint stands.
              </p>
              <div className="landing-spotlight-mock" aria-hidden="true">
                <div className="landing-linear-cycle">
                  <div className="landing-linear-cycle-header">
                    <span className="landing-linear-cycle-label">Cycle 7</span>
                    <span className="landing-linear-cycle-days">DAY 4 / 14</span>
                  </div>
                  <div className="landing-linear-cycle-bar">
                    <div
                      className="landing-linear-cycle-fill landing-linear-cycle-fill-anim"
                      style={{ width: "57%" }}
                    />
                  </div>
                  <div className="landing-linear-cycle-counts">
                    <span className="landing-linear-cycle-done">DONE <strong>8</strong></span>
                    <span className="landing-linear-cycle-inprog">IN-PROG <strong>3</strong></span>
                    <span className="landing-linear-cycle-todo">TODO <strong>5</strong></span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Feature strip ── */}
      <section className="landing-features">
        <div className="landing-features-inner">
          <div className="landing-features-heading section-head">
            <span className="section-title -rotate-1">What you get</span>
          </div>
          <ul className="landing-feature-grid">
            {FEATURES.map(({ label, body, rotate }) => (
              <li key={label} className={`landing-feature-card card ${rotate}`}>
                <div className="card-label">{label}</div>
                <p className="landing-feature-body">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <p className="landing-trust">
            Client-side only. Your GitHub token stays in your browser.
          </p>
          <button
            type="button"
            className="btn btn-primary landing-cta"
            onClick={onSignIn}
          >
            Sign in with GitHub
          </button>
          <div className="landing-footer-links">
            <a
              href="https://github.com/sairambokka/pr-dashboard"
              className="btn landing-footer-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
            <a
              href="https://sairambokka.github.io"
              className="btn landing-footer-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit my site
            </a>
            <a
              href="https://buymeacoffee.com/sairambokka"
              className="btn btn-primary landing-footer-coffee"
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy me a coffee ☕
            </a>
          </div>
          <p className="landing-footer-byline">Built by Sairam Bokka</p>
        </div>
      </footer>
    </div>
  );
}
