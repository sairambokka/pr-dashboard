# Backend Requirements — Shared Chrome + Infra

## 1. Top Bar Elements

### Brand Mark
- Static text "PR.DASHBOARD" with `.brand-mark` swatch. No data, no click.

### Repo Crumb (`corca-dev / corca-app`)
- Source: `settings.owner` / `settings.repo` (localStorage). Hardcoded default at first run, editable in Settings.
- Click → open `https://github.com/{owner}/{repo}` in new tab (`target="_blank" rel="noopener"`). Passive otherwise.

### User Tag (`sairambokka`)
- Source: GraphQL `viewer.login` cached on app boot (refresh on PAT change). Fallback: hide if not yet resolved.
- Click → open `https://github.com/{login}` in new tab.

### Last Updated Timestamp (`UPDATED 00:42 AGO`)
- Source: `state.lastPollAt` (epoch ms), set on the last successful poll across any active tab.
- Format: `mm:ss` for <1h, `Xh` for <24h, `Xd` after.
- Rerender every 10s via single global `setInterval` (don't tie to React state churn — use a `useNow(10_000)` hook).

### LIVE Indicator
- Derived state, three modes:
  - `LIVE` (amber pulsing dot) — polling active, last poll ok.
  - `PAUSED` (grey static dot) — `document.visibilityState === 'hidden'` for >5min, or user toggled off, or offline.
  - `ERROR` (red dot, no pulse) — last poll threw (network, 5xx, parse).
- Hover tooltip: poll interval + next-poll countdown.

### REFRESH Button
- Action: cancel current debounce, trigger immediate poll cycle for the *active tab only* (cheaper) + invalidate that tab's cache.
- Disabled + spinner glyph while in-flight. Min 400ms visible (avoid flash).
- Keyboard shortcut: `R` (no modifier needed when not focused in input).

### SETTINGS Button
- Opens settings modal (overlay, focus-trapped, ESC closes). See §11.

## 2. Tab Navigation
- 4 tabs: PRS / ACTIVITY / INSIGHTS / LINEAR. Mocks use static `.html` links — real app uses hash router (`#/prs`, `#/activity`, `#/insights`, `#/linear`) so GitHub Pages deep-links survive reload without 404s. React Router not needed.
- Strategy: **hybrid**. PRs eagerly fetched on boot (default landing). Others fetched on first activation, then kept warm by their own per-tab polling cadence (see §3).
- Active marker: `aria-current="true"` on the matching `<a>`. Click never blocks — instant route change, data renders skeleton if no cache.

### Tab Counts
- PRS shows `15` = `authored(11) + awaitingYourReview(04)`. Confirmed by `.scope-toggle` counts on `01-prs.html`. Recompute after each PR poll.
- ACTIVITY / INSIGHTS / LINEAR have no count badges in current mocks (don't add — keeps chrome calm).

## 3. Polling Strategy
- Per-tab cadences (defaults, overridable in Settings):
  - PRs: 60s (active tab), 5min (background).
  - Activity: 60s (active), 5min (background).
  - Insights: 5min always (expensive aggregations).
  - Linear: 5min always.
- Visibility-aware: `document.visibilityState === 'hidden'` ⇒ multiply by 5x.
- Stagger: offset each tab's first poll by 2s × index to avoid burst-rate hits.
- Single shared `BackgroundPoller` orchestrator; per-tab fetch funcs registered with `(intervalMs, fetchFn, cacheKey)`.

## 4. State Management

LocalStorage keys:
- `pr-dashboard.settings` — `{ pat, owner, repo, intervalSec, linearKey, linearTeamId, notifications, quietHours }`.
- `pr-dashboard.seen` — `{ [prNumber]: { lastCommentId, lastReviewId, lastCiStatus, snoozedUntil } }` for unread bubbles.
- `pr-dashboard.cache.<tab>` — `{ fetchedAt, ttlMs, payload }`. One slot per tab (not per-timestamp — avoids unbounded growth).
- `pr-dashboard.viewer` — `{ login, avatarUrl, fetchedAt }`.

Eviction: cache entries older than `5 × ttlMs` discarded on boot. Hard cap localStorage at ~2MB; if exceeded, drop oldest cache slot first, never settings or seen.

## 5. Error Handling
- GitHub 401 → flip LIVE to ERROR, open Settings to PAT field with inline error "Token invalid/expired".
- GitHub 403 (rate-limit) → read `X-RateLimit-Reset`, show banner `RATE LIMITED · RESUMES IN MM:SS`, pause polling, auto-resume.
- GitHub 5xx → exponential backoff (60s → 120s → 240s, cap at 10min), keep cache visible, banner `GITHUB UNREACHABLE · RETRY IN ...`.
- Linear 401 → banner on Linear tab only (don't block PRs/Activity); Settings prompt for new key.
- `navigator.onLine === false` → banner `OFFLINE`, pause all pollers, resume on `online` event.
- Per-tab fault isolation: each tab's fetch wrapped in try/catch; an Insights crash never breaks PRs.

## 6. Rate Limits
- GitHub GraphQL: 5000 pts/hr. Each PRs poll ≈ 10 pts. 60s cadence × 60min = 60 polls = ~600 pts/hr. Safe.
- Activity (REST events): 1 call/poll. 60/hr. Safe.
- Insights (heavy GraphQL with reviews/timeline): budget 50 pts/poll × 12/hr = 600 pts/hr.
- Linear: 1500/hr per team; 12 polls/hr × ~5 queries = 60. Safe.
- Total worst case ~1300 pts/hr GitHub → 26% of budget. REFRESH spam protected by 5s client debounce.

## 7. Browser Notifications
- Permission requested on first SETTINGS open (not page load — less spammy).
- Triggers (only if tab not focused on relevant PR):
  - New comment from non-self.
  - Review approved / changes-requested.
  - CI red→green or green→red transition.
  - `@sairambokka` mention in any comment body.
- Click → `window.focus()`, navigate to `#/prs`, scroll PR row into view, mark seen.
- Suppress during quiet hours.

## 8. Favicon Badge
- Count = unread PRs (rows with `.is-unread` per §4 seen-tracking).
- Redraw favicon on every poll using OffscreenCanvas; document.title also prefixed `(N) PR Dashboard`.

## 9. Keyboard Shortcuts (global, ignore when typing in input/textarea)
- `R` — refresh active tab.
- `1` / `2` / `3` / `4` — switch tab.
- `,` — open settings.
- `Esc` — close settings/modals.
- `?` — show shortcut cheatsheet overlay.
- Reserved: `j` / `k` row nav, `g p` go-prs etc. (future).

## 10. Loading States
- First-ever fetch (no cache): skeleton rows (3–5 grey bars matching tab's grid template), `.shimmer` keyframe (1.4s opacity sweep).
- Subsequent polls with cache: render stale data, show subtle 1px amber bar under topbar that drains across the row while fetching.
- Empty states: centred text in `--muted`, e.g. `NO OPEN PRS // ALL CLEAR`, `NO ACTIVITY IN 7D`, `LINEAR KEY NOT CONFIGURED → SETTINGS`.

## 11. Settings Modal Structure
- **GitHub** group: PAT (password input, show/hide toggle, validates on blur via `viewer` query), owner, repo. "Test connection" button.
- **Linear** group: API key, team ID (dropdown populated after key validates).
- **Polling** group: interval (30s / 60s / 2min / 5min select), "Pause when hidden" toggle.
- **Quiet hours**: start/end time pickers, days-of-week multiselect.
- **Notifications**: master toggle, per-trigger checkboxes (comment / review / CI / mention).
- **Data**: "Clear cache", "Clear seen state", "Reset all" (confirms).
- **About**: version, link to repo. Sign-out = clear settings.pat + reload.

## 12. Open Questions
- Tab count `15` — confirm it's authored+awaiting and not "all open in repo". Mocks support authored+awaiting reading; if user wants repo-wide count, scope-toggle counts would no longer sum to the badge.
- Repo crumb editability — is the app intended single-repo forever, or should crumb itself open a repo picker? Current mocks treat it as read-only label.
- LIVE indicator on a per-tab basis or app-wide? Recommend app-wide (simpler chrome); per-tab errors surface as inline banners.
- Scanline overlay (`.overlay-scan`) — pure CSS, no JS, no backend impact. Confirmed.
- Should REFRESH refresh all tabs or just active? Recommend active-only (cheaper, more honest).

## 13. Recommended Tech Stack Additions
App is small (~4 tabs, single repo, single user). Recommend keeping it lean:
- **Router**: hand-rolled hash router (~30 lines: listen `hashchange`, render switch). React Router is overkill.
- **Data fetching**: TanStack Query — worth it. Gets us cache, dedupe, stale-while-revalidate, retry/backoff, `refetchInterval` per-key (maps cleanly to per-tab cadence), `refetchOnWindowFocus`, devtools. Replaces hand-rolled poller + cache layer in §3/§4.
- **State**: plain `useState` + `useSyncExternalStore` for localStorage subscription. Zustand unnecessary at this size.
- **Notifications/favicon/keyboard**: vanilla browser APIs, no libs.

Net adds: `@tanstack/react-query` only. Everything else stays vanilla.
