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
    label: "Unread Comment Deltas",
    body: "See exactly how many new comments landed since your last visit. Red badge, never missed.",
    rotate: "-rotate-1",
  },
  {
    label: "Cycle-Time Insights",
    body: "Track open → merged time per repo and spot where PRs stall in your workflow.",
    rotate: "rotate-1",
  },
  {
    label: "Linear Integration",
    body: "Linked Linear issues surface right next to the PR. Status, assignee, cycle — no context switch.",
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

export function LandingPage({ onSignIn }: Props): JSX.Element {
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
        <div className="landing-hero-inner">
          <div className="landing-eyebrow section-title">
            GitHub PR Inbox
          </div>
          <h1 className="landing-headline">
            Every PR.<br />
            Every repo.<br />
            One dashboard.
          </h1>
          <p className="landing-subhead">
            A Linear-style command centre for your GitHub pull requests — CI
            status, review queues, unread comments, cycle times, and linked
            Linear issues, all in one place.
          </p>
          <button
            type="button"
            className="btn btn-primary landing-cta"
            onClick={onSignIn}
          >
            Sign in with GitHub
          </button>
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
              href="https://www.linkedin.com/in/bokka-sairam/"
              className="btn landing-footer-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Connect on LinkedIn
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
