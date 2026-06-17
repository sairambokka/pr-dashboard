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

      {/* ── Trust line + CTA repeat ── */}
      <section className="landing-footer-cta">
        <div className="landing-footer-cta-inner">
          <p className="landing-trust">
            Client-side only. Your GitHub token stays in your browser.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSignIn}
          >
            Sign in with GitHub
          </button>
        </div>
      </section>
    </div>
  );
}
