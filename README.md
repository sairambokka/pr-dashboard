# PR Dashboard

Linear-style view of your open GitHub PRs in one repo. Polls the GitHub API on an
interval and fires browser notifications when comment counts go up.

Pure static app, deployable to GitHub Pages. No backend, no secrets stored anywhere
but your own browser localStorage.

## Features

- List of open PRs you authored in a chosen repo
- Per-PR comment count badge (issue + review comments combined)
- Unread delta badge — new comments since last refresh
- Review state pill: Approved / Changes requested / Review required
- CI status dot (passing / failing / pending)
- Web Notifications + favicon badge when new comments arrive
- Configurable poll interval (default 60s)

## Setup

1. Install:
   ```bash
   pnpm install
   pnpm dev
   ```
2. Open the app, click **Settings**.
3. Paste a GitHub Personal Access Token. **Fine-grained PAT** with the target
   repo's **Pull requests: Read** and **Contents: Read** permissions is enough.
   - Token never leaves your browser. Stored only in `localStorage`.
4. Set `owner` and `repo` (e.g. `corca-ai` / `corca-app`).
5. Save. PRs load.
6. Allow browser notifications when prompted.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. The included `.github/workflows/deploy.yml` builds and publishes on every push
   to `main`. The Vite `base` path auto-adjusts to `/<repo-name>/`.

## Sharing with colleagues

Each user needs their own PAT (the token is browser-local and personal). Send
them the deployed URL. v1 limitation; OAuth via a tiny Cloudflare Worker proxy
would remove the PAT step — not in this version.

## Stack

- Vite + React + TypeScript
- GitHub GraphQL API v4
- Web Notifications API + Canvas favicon
- No backend

## Scripts

```bash
pnpm dev      # local dev server
pnpm build    # production bundle to dist/
pnpm tsc -b   # type check
```
