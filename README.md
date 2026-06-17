# PR Dashboard

Mission control for your GitHub pull requests. Sign in with GitHub and get an at-a-glance
overview of everything that needs your attention — across all your repos.

Static app deployed at **https://sairambokka.github.io/pr-dashboard/**. Sign-in uses GitHub OAuth via one
tiny Cloudflare Worker (the only server-side piece — it just exchanges the OAuth `code` for a
token). No secrets stored anywhere but your own browser `localStorage`. Fully client-side.

## How it works

1. **Sign in with GitHub** — OAuth flow handled by the Cloudflare Worker; your token never
   leaves the browser.
2. **Mission-control home** — welcome screen with at-a-glance stats:
   - Total open PRs across your repos
   - Number of repos with open PRs
   - PRs currently awaiting your review
   - An "awaiting your review" list you can act on immediately
   - A list of repos where you have open PRs — click any to dive in
3. **Repo workspace** — click a repo from the home screen to open its workspace with three
   tabs: **PRs**, **Insights**, and **Linear**. The repo is selected at runtime; there is no
   owner/repo field to configure in Settings.

## Features

**Repo workspace tabs:**

| Tab | Description |
|-----|-------------|
| **PRs** | PRs you authored + PRs awaiting your review for that repo |
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
| `2` | Go to Insights tab |
| `3` | Go to Linear tab |
| `,` | Open Settings |
| `?` | Show keyboard shortcuts help |
| `Esc` | Close modal / dismiss panel |

## Setup

Day-to-day use after the one-time OAuth setup below:

1. Open **https://sairambokka.github.io/pr-dashboard/**.
2. Click **Sign in with GitHub**, approve the read access.
3. You land on the mission-control home — your repos and open PRs appear automatically.
4. Click any repo to open its workspace.
5. Allow browser notifications when prompted.

The access token never leaves your browser — stored only in `localStorage`.

## One-Time OAuth Setup

Sign-in needs a GitHub OAuth App (public Client ID) plus a Cloudflare Worker that holds
the Client Secret and performs the `code → token` exchange (the browser can't, due to the
secret + GitHub's lack of CORS on the token endpoint). All free.

### 1. Create the OAuth App

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Homepage URL**: `https://sairambokka.github.io/pr-dashboard/`
3. **Authorization callback URL**: `https://sairambokka.github.io/pr-dashboard/#/auth/callback`
   (for local dev add a second OAuth App with `http://localhost:5173/#/auth/callback`).
4. Note the **Client ID**. Generate a **Client Secret** (used only by the Worker).

### 2. Deploy the Worker

```bash
cd worker
npm install
# edit wrangler.toml: set GITHUB_CLIENT_ID and ALLOWED_ORIGIN (your SPA origin)
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the secret — never committed
npx wrangler deploy                            # prints https://<name>.<sub>.workers.dev
```

`ALLOWED_ORIGIN` must be the SPA origin only: `https://sairambokka.github.io`
(no trailing slash, no path). Free tier: 100 k requests/day.

### 3. Point the SPA at it

Two public (non-sensitive) build-time vars:

- `VITE_GH_CLIENT_ID` — the OAuth App Client ID
- `VITE_AUTH_WORKER_URL` — the deployed Worker URL

**Local dev** — create `.env` (gitignored) at repo root:

```
VITE_GH_CLIENT_ID=Iv1.xxxxxxxx
VITE_AUTH_WORKER_URL=https://pr-dashboard-auth.<sub>.workers.dev
```

```bash
pnpm install && pnpm dev
```

**GitHub Pages** — set both as repo **Variables** (Settings → Secrets and variables →
Actions → *Variables* tab, not Secrets). The deploy workflow already passes them through.

## Linear Setup

1. Go to **Settings → Linear**.
2. Paste your Linear API key (from [linear.app/settings/api](https://linear.app/settings/api)).
3. Optionally enter a **Team ID** to scope results to one team.
4. Save. The Linear tab will populate with issues linked to your open PRs.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Source: GitHub Actions**.
3. Set the `VITE_GH_CLIENT_ID` and `VITE_AUTH_WORKER_URL` repo **Variables** (see One-Time
   OAuth Setup above).
4. The included `.github/workflows/deploy.yml` builds and publishes on every push to `main`.
   The Vite base path auto-adjusts to `/<repo-name>/` (i.e. `/pr-dashboard/`).

## Deploying your own copy

To run your own instance under a different account/repo, the manual (non-CI) steps are:

**(a) Update the GitHub OAuth App** to match your Pages URL:
- **Homepage URL**: `https://<user>.github.io/<repo>/`
- **Authorization callback URL**: `https://<user>.github.io/<repo>/#/auth/callback`

**(b) Redeploy the Cloudflare Worker.** In `worker/wrangler.toml`, set
`ALLOWED_ORIGIN = "https://<user>.github.io"` (origin only, no path), then:

```bash
cd worker
npx wrangler deploy
```

**(c) Set repo Actions Variables** (Settings → Secrets and variables → Actions → Variables):
- `VITE_GH_CLIENT_ID` — your OAuth App Client ID
- `VITE_AUTH_WORKER_URL` — the Cloudflare Worker URL

## Sharing with Colleagues

Share **https://sairambokka.github.io/pr-dashboard/**. Each user signs in with their own GitHub account
via the **Sign in with GitHub** button — no tokens to mint or paste. The OAuth App and
Worker are shared infrastructure you set up once; each user's token stays browser-local and
personal.

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
