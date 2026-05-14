# PR Dashboard

Linear-style view of your open GitHub PRs. Polls the GitHub API on an interval and fires
browser notifications when comment counts go up.

Pure static app, deployable to GitHub Pages. No backend, no secrets stored anywhere but your
own browser `localStorage`.

## Features

**4 tabs:**

| Tab | Description |
|-----|-------------|
| **PRs** | PRs you authored + PRs awaiting your review, in one view |
| **Activity** | Recent comment and review activity across your PRs |
| **Insights** | Metrics: cycle time, review turnaround, merge rate — toggle period (7d / 30d / 90d) |
| **Linear** | Issues linked to your PRs, pulled from the Linear API |

**Additional capabilities:**

- Per-PR comment count badge (issue + review comments combined)
- Unread delta badge — new comments since last refresh
- Review state pill: Approved / Changes requested / Review required
- CI status dot (passing / failing / pending)
- Web Notifications + favicon badge when new comments arrive
- Configurable poll interval (default 60 s)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Refresh now |
| `1` | Go to PRs tab |
| `2` | Go to Activity tab |
| `3` | Go to Insights tab |
| `4` | Go to Linear tab |
| `,` | Open Settings |
| `?` | Show keyboard shortcuts help |
| `Esc` | Close modal / dismiss panel |

## Setup

1. Install and run:
   ```bash
   pnpm install
   pnpm dev
   ```
2. Open the app, click **Settings** (or press `,`).
3. Paste a GitHub Personal Access Token.
   - **Fine-grained PAT** with **Pull requests: Read** and **Contents: Read** on the target repo.
   - Token never leaves your browser — stored only in `localStorage`.
4. Set `owner` and `repo` (e.g. `corca-ai` / `corca-app`).
5. Save. PRs load immediately.
6. Allow browser notifications when prompted.

## Linear Setup

1. Go to **Settings → Linear**.
2. Paste your Linear API key (from [linear.app/settings/api](https://linear.app/settings/api)).
3. Optionally enter a **Team ID** to scope results to one team.
4. Save. The Linear tab will populate with issues linked to your open PRs.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Source: GitHub Actions**.
3. The included `.github/workflows/deploy.yml` builds and publishes on every push to `main`.
   The Vite `base` path auto-adjusts to `/<repo-name>/`.

## Sharing with Colleagues

Each user needs their own PAT (the token is browser-local and personal). Send them the
deployed URL and point them to the Setup section above.

## Stack

- Vite + React + TypeScript
- GitHub GraphQL API v4
- Linear REST API
- Web Notifications API + Canvas favicon
- No backend

## Scripts

```bash
pnpm dev      # local dev server
pnpm build    # production bundle to dist/
pnpm tsc -b   # type check
pnpm lint     # ESLint
```
