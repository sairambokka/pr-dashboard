# PR Dashboard — Master Backend Plan

Synthesis of 5 subagent audits. Source mocks: `mocks/01-prs.html` · `02-activity.html` · `03-insights.html` · `04-linear.html`.

Per-tab deep-dive docs:
- `backend-prs.md` — PRs tab (Authored + Awaiting Review)
- `backend-activity.md` — Activity tab
- `backend-insights.md` — Insights tab
- `backend-linear.md` — Linear tab
- `backend-chrome.md` — top bar, tabs, polling, settings, errors

## Architecture summary

Static React SPA on GitHub Pages. No backend server. All data fetched client-side from:
1. **GitHub GraphQL v4** (Bearer fine-grained PAT) — primary data source
2. **GitHub REST v3** (same PAT) — `/events`, `/stats/contributors`, `/stats/commit_activity`
3. **Linear GraphQL** (Personal API Key) — new external dependency for Linear tab
4. **localStorage** — PAT, Linear key, settings, last-seen state, cache slots

Polling-only — no webhooks (would require backend). Phone notifications already covered by separate Cloudflare Worker (`corca-pr-notifier`).

## Tech stack additions

Net new dep:
- `@tanstack/react-query` — replaces hand-rolled poller + cache layer. Per-tab `refetchInterval`, stale-while-revalidate, retry/backoff, devtools.

Everything else stays vanilla: hand-rolled hash router (~30 LOC), `useState` + `useSyncExternalStore` for localStorage, vanilla browser APIs for notifications/favicon/keyboard.

## Tab status overview

| Tab | New GraphQL queries | New REST endpoints | New external auth |
|-----|---------------------|--------------------|--------------------|
| PRs (Authored) | extend existing query | — | — |
| PRs (Awaiting Review) | `search` query w/ `review-requested:@me` + new turnaround query | — | — |
| Activity | — | `/repos/{o}/{r}/events` w/ ETag | — |
| Insights | search queries for opened/merged/CI rate + commit history | `/stats/contributors`, `/stats/commit_activity` | — |
| Linear | — | — | Linear API key (new setting) |

---

## PRs tab — checklist

### Authored view (existing, extend)

Already wired. Additions:
- [ ] Expand `SeenMap` from `{ [num]: count }` to `{ [num]: { totalComments, latestReviewSubmittedAt, ciState } }` so unread highlight fires on review/CI events, matching ntfy logic. Bubble number stays = comment delta.
- [ ] Render `.tag-draft` "○ DRAFT" when `isDraft === true` (CSS exists, currently unused).
- [ ] Optional: render `.tag-pending` "○ REVIEW REQ" when `reviewDecision === REVIEW_REQUIRED` and no effective review (open question).
- [ ] Click row → write current snapshot to seen, `window.open(pr.url, '_blank')`.
- [ ] Migration shim for old `SeenMap` shape.

### Awaiting Your Review view (new)

- [ ] New GraphQL query: `search(query: "is:pr is:open review-requested:@me repo:${owner}/${repo}", type: ISSUE, first: 50)` returning same fields as authored query + `timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT])` for blocking-age timestamp.
- [ ] **Blocking age = max(ReviewRequestedEvent.createdAt for events targeting viewer)**, NOT createdAt/updatedAt. Falls back to `createdAt` if no such event found.
- [ ] Visual: `.is-blocking` red left-border + tint when `blockingDays >= 3`. `.tag-blocking` "◆ BLOCKING Nd" inline.
- [ ] `.blocking-warn` amber age column for `1 ≤ blockingDays < 3`.

### Summary bar (Awaiting view only, 4 cells)

- [ ] PENDING = awaitingReviewPRs.length
- [ ] BLOCKING ≥ 3D = count where blockingDays ≥ 3
- [ ] AVG TURNAROUND = mean of (firstReviewSubmittedAt − reviewRequestedAt) for recently-closed PRs in 30d window. **Separate query polled every 10 min**: `search(query: "is:pr is:closed repo:${repo} closed:>=${30d-ago}")` + `timelineItems` for REVIEW_REQUESTED_EVENT + PULL_REQUEST_REVIEW.
- [ ] OLDEST = max(blockingDays), red when ≥ threshold.

### Tab count badge ("15")

- [ ] = `unique union of authored + awaitingReview PR numbers` (rare dupe possible).

### Open product decisions (PRs)

- [ ] Sort order: createdAt vs updatedAt? (Existing uses UPDATED_AT.)
- [ ] Render pending/draft badges?
- [ ] Awaiting-review rows: show unread bubbles too?
- [ ] Refresh button: bypass 60s gate AND reset, vs just one extra fetch?

---

## Activity tab — checklist

### Data source: REST Events (recommended)

- [ ] `GET /repos/${owner}/${repo}/events?per_page=30&page=N` with `If-None-Match` ETag header for 304 polling (free against rate limit).
- [ ] Filter client-side to `type === "PullRequestEvent"`. Map `payload.action` ∈ {opened, closed, reopened} + `payload.pull_request.merged` flag.
- [ ] Paginate up to ~3 pages if needed to cover 7 days.

### Cadence sparkline (7 bars)

- [ ] Bucket events into 7 viewer-local-day bins.
- [ ] Bar height = total events/day (opened + merged + closed combined).
- [ ] Right stats panel: separate counts (OPENED / MERGED / CLOSED) over same window.
- [ ] Header label `14 / 38 / 06` semantics = `opened / total / closed` (confirm).

### Event stream

- [ ] Group by viewer-local calendar day. DESC by timestamp within day.
- [ ] Day labels: `TODAY · WED 13`, `YESTERDAY · TUE 12`, then `MON 11 MAY`.
- [ ] Row format: `HH:mm | icon | @actor verb #PR title | KIND`.
- [ ] Icons: merged=◆ green, opened=◇ amber, closed=◇ red.
- [ ] Click → open `https://github.com/{o}/{r}/pull/{N}` in new tab.

### Open product decisions (Activity)

- [ ] Filter bot actors (dependabot, github-actions)?
- [ ] Reopened events: merge into OPENED bucket or show separately?
- [ ] Window fixed at 7d or user-configurable?
- [ ] Timezone: viewer local vs repo default?

---

## Insights tab — checklist

### Period toggle (7D / 30D / 90D / 1Y / ALL)

- [ ] Default 30D. Selection persisted in URL `?period=30d` + localStorage.
- [ ] Section title reflects selection (`INSIGHTS // ROLLING N DAYS` or `INSIGHTS // ALL TIME`).
- [ ] All deltas compute vs previous window of equal length. `ALL` hides delta.
- [ ] `ALL` anchored to `repository.createdAt` (unambiguous, not viewer's first commit).

### Personal contribution panel

- [ ] Avatar: `viewer.avatarUrl(size: 88)`. Fallback: monogram from `viewer.login`.
- [ ] `@handle`, `N COMMITS`, `+NN added`, `−NN removed` over selected period.
- [ ] Repo rank: viewer position by commits in period, sourced from `/stats/contributors`.
- [ ] Bar chart: daily for ≤30D, weekly for 90D/1Y/ALL. Weekend bars 40% opacity.
- [ ] Data: GraphQL `repository.defaultBranchRef.target.history(author:{id}, since, until)` for commit list + additions/deletions.
- [ ] Handle 202 from REST stats endpoints with exponential backoff (1s/2s/4s, cap 10s).
- [ ] Multi-email author matching: use `User.id` filter; surface setting to add commit-email aliases.

### Next Action callout

- [ ] Computed client-side from PRs tab data. No new endpoint.
- [ ] Priority order: changes-requested+unread > approved+CI-green+unmerged > review-requested > unread-comment.
- [ ] Empty state: `Inbox zero. Nothing waiting on you.`

### Stat cards (6 cards, each w/ value + delta + foot)

- [ ] A. PRs Opened: `search "is:pr author:<login> created:<range>"` → issueCount
- [ ] B. PRs Merged: `search "is:pr author:<login> merged:<range>"` → issueCount (accent value color)
- [ ] C. Median Time to Merge: median of `(mergedAt − createdAt)` over B's PRs, in days to 1dp
- [ ] D. Your Review Queue: `search "is:pr is:open review-requested:<login>"` → issueCount + oldest sub-stat
- [ ] E. Repo Open PRs: `pullRequests(states: OPEN).totalCount` + oldest age + stale-count (updatedAt < now-7d)
- [ ] F. CI Fail Rate (first push): of B's PRs, count where `commits(first:1).statusCheckRollup.state === FAILURE` ÷ total with checks. Render integer %.
- [ ] **Delta color**: invert for C and F — *down* on these is good → green ▼ not red. (Mock got this wrong.)

### Throughput chart (2-series line)

- [ ] Series 1 (amber solid): viewer's PRs opened per day, bucketed by createdAt.
- [ ] Series 2 (green dashed): viewer's PRs merged per day, bucketed by mergedAt.
- [ ] X-axis: each day in period (weekly buckets when period ≥ 90D).
- [ ] Y-axis: auto-scaled with ~20% headroom, 3 gridlines.
- [ ] Hover tooltip: `MAY 03 · 2 opened · 3 merged`.

### Top reviewers bar (4–6 rows)

- [ ] Aggregate `reviews[].author.login` across viewer's PRs in period.
- [ ] Dedupe: count distinct PRs reviewed per reviewer (not raw review submissions).
- [ ] Sort DESC, top 5. Bar width = count / max × 100%.
- [ ] Exclude viewer's self-comments.
- [ ] Click → filter PRs tab by reviewer (future).

### Commit cadence (30 vertical bars)

- [ ] Source: `GET /stats/commit_activity` — last 52 weeks of repo-wide daily counts.
- [ ] Flatten last 30 days. Weekend bars at 40% opacity.
- [ ] Footer: `N COMMITS · PEAK WEEKDAY`.

### Repo Health (2×2 mini-grid)

- [ ] OPEN PRS: `pullRequests(states: OPEN).totalCount`
- [ ] STALE > 7D: `search "is:pr is:open updated:<lt now-7d>"`. Exclude drafts (suggested).
- [ ] OLDEST OPEN: `search "is:pr is:open sort:created-asc" first:1` → days
- [ ] MERGES/DAY: count of `is:pr merged:<period>` ÷ period days

### Caching (Insights only)

| Data | TTL |
|------|-----|
| `viewer` | 24h |
| `repository.createdAt` | infinite |
| PR list aggregates | 60s |
| Top reviewers | 5min |
| `/stats/contributors` | 1h |
| `/stats/commit_activity` | 1h |
| Personal contribution chart | 5min |

### Open product decisions (Insights)

- [ ] Repo rank basis: commits / lines / PRs merged? (Default: commits.)
- [ ] Stale count include drafts? (Suggested: exclude.)
- [ ] `ALL` perf cap (1000 PRs for very old repos)?
- [ ] CI fail rate: include `PENDING` first-commit rollup? (Suggested: exclude.)

---

## Linear tab — checklist

### Auth setup (new)

- [ ] Settings panel: new field "Linear API Key" (password input, masked, show/hide toggle).
- [ ] Optional: "Linear Team ID" dropdown (populated from viewer.teams after key validates).
- [ ] Header: `Authorization: <key>` (Linear personal keys take raw key, no `Bearer ` prefix). OAuth tokens use `Bearer`.
- [ ] Store in localStorage as `linear_api_key`. Never log or send anywhere else.

### Linear GraphQL queries

- [ ] Query A: `viewer { id name email teams { nodes { id key name } } }` — once per session.
- [ ] Query B: active cycle for team — `cycles(filter: {team: {id: {eq: $teamId}}, isActive: {eq: true}})` w/ `progress, scopeHistory, completedScopeHistory, startsAt, endsAt`.
- [ ] Query C: my tickets in cycle — `issues(filter: {assignee: {isMe: {eq: true}}, cycle: {id: {eq: $cycleId}}})`.
- [ ] Query D fallback: my open issues (when cycle filter empty).

### Cycle progress bar

- [ ] Fill width = `Math.round(progress × 100)%`. Tick mark at same %.
- [ ] Date row: `startsAt | WED · DAY X / N | endsAt`.
- [ ] Stats: DONE/IN-PROG/TODO from `state.type` aggregation. `SCOPE` = total issues. `BURNED %` = completedScope/scope.

### PR ↔ ticket mapping

- [ ] Regex `^([A-Z]+-\d+):` against PR titles (case-insensitive).
- [ ] Build `Map<identifier, PR>` from GitHub data + `Map<identifier, Issue>` from Linear.
- [ ] Render union by identifier. Both → linked row. Linear-only → dimmed row at bottom. PR-only (no prefix) → skip on this tab.

### Status badges (5 variants)

- [ ] Map `state.type` (Linear's 5 fixed types) to badge:
  - `backlog`, `unstarted`, `canceled` → TODO (gray)
  - `started` → IN PROGRESS (yellow)
  - `started` + name matches `/review/i` → IN REVIEW (blue)
  - `completed` → DONE (green)
  - name matches `/blocked/i` → BLOCKED (red)

### Mismatch detection (cross-source rules)

- [ ] ticket `unstarted|started` + PR merged → **MISMATCH** (red)
- [ ] ticket `completed` + PR open/draft → **MISMATCH** (red)
- [ ] state name "In Review" + PR has CHANGES_REQUESTED → MISMATCH
- [ ] state name "In Review" + PR draft → INFO (amber)
- [ ] state name "Blocked" + PR open → INFO (amber)

### Sort order

- [ ] 1. Active-cycle linked rows by status: IN REVIEW → IN PROGRESS → TODO → BLOCKED → DONE
- [ ] 2. Tie-break by `updatedAt` DESC
- [ ] 3. Dimmed (Linear-only) rows last, sorted by status then identifier

### Click behavior

- [ ] Ticket side click → `window.open(issue.url, '_blank')`
- [ ] PR side click → `window.open(pr.url, '_blank')` w/ `stopPropagation`

### Polling

- [ ] 5min cadence for Linear queries (issues + cycle).
- [ ] PR state column reuses 60s GitHub poll.
- [ ] REFRESH button forces both.

### Open product decisions (Linear)

- [ ] Multi-team user: pick first team or require selection?
- [ ] Ticket prefixes other than `D-` (e.g. `CORE-`, `ENG-`)?
- [ ] Cycle stats: all-team or my-assignee-only?
- [ ] Canceled tickets w/ open PR: show or hide?

---

## Shared chrome — checklist

### Top bar elements

- [ ] Brand mark static
- [ ] Repo crumb → click opens `github.com/{owner}/{repo}` in new tab
- [ ] User tag = `viewer.login`. Click → opens GitHub profile
- [ ] `UPDATED Xm AGO` from `state.lastPollAt`, formatted relative, re-renders every 10s via `useNow(10_000)` hook
- [ ] LIVE indicator: 3 states (LIVE amber pulse / PAUSED gray static / ERROR red static). Derive from poll state + visibility + last error
- [ ] REFRESH button: cancels debounce, immediate poll of active tab only, invalidates that tab's cache. Min 400ms spinner. Keyboard: `R`
- [ ] SETTINGS button: opens modal

### Routing

- [ ] Hand-rolled hash router: `#/prs`, `#/activity`, `#/insights`, `#/linear`. ~30 LOC. Default = `#/prs`.
- [ ] Survives GitHub Pages reload.
- [ ] Per-tab data fetching: PRs eager on boot, others lazy on first activation then warm.

### Polling cadences

| Tab | Foreground | Background |
|-----|-----------|-----------|
| PRs | 60s | 5min |
| Activity | 60s | 5min |
| Insights | 5min | 5min |
| Linear | 5min | 5min |

- [ ] Stagger: offset first poll by 2s × tab index.
- [ ] Visibility-aware: `document.visibilityState === 'hidden'` → multiply cadence by 5×.

### State management

- [ ] localStorage keys:
  - `pr-dashboard.settings` — PAT, owner, repo, intervalSec, linearKey, linearTeamId, notifications, quietHours
  - `pr-dashboard.seen` — `{ [prNum]: { totalComments, latestReviewSubmittedAt, ciState, snoozedUntil } }`
  - `pr-dashboard.cache.<tab>` — `{ fetchedAt, ttlMs, payload }` one slot per tab
  - `pr-dashboard.viewer` — `{ login, avatarUrl, fetchedAt }`
- [ ] Eviction: discard cache slots > 5×ttlMs on boot. Cap localStorage ~2MB.

### Error handling

- [ ] GitHub 401 → LIVE→ERROR, open Settings to PAT
- [ ] GitHub 403 (rate limit) → banner w/ `X-RateLimit-Reset` countdown, pause + auto-resume
- [ ] GitHub 5xx → exponential backoff 60s→120s→240s cap 10min
- [ ] Linear 401 → banner on Linear tab only (don't block other tabs)
- [ ] `navigator.onLine === false` → OFFLINE banner, pause all
- [ ] Per-tab fault isolation: try/catch per fetch

### Rate budget

- ~1300 pts/hr GitHub GraphQL worst case = 26% of 5000 budget
- REST events: 60/hr ≈ negligible
- Linear: ~60/hr against 1500 budget
- REFRESH: 5s client debounce against spam

### Notifications (browser, in-app)

- [ ] Permission requested on first SETTINGS open (not page load).
- [ ] Triggers: new comment from non-self / review state change / CI red→green or green→red / @mention.
- [ ] Suppress when tab focused on relevant PR.
- [ ] Suppress during quiet hours.
- [ ] Click → focus tab, navigate to PR, scroll into view, mark seen.

### Favicon badge

- [ ] Count = unread PR rows. Redraw via OffscreenCanvas after each poll. Title prefix `(N) PR Dashboard`.

### Keyboard shortcuts (global, ignore when typing)

- [ ] `R` refresh, `1-4` switch tab, `,` settings, `Esc` close modals, `?` cheatsheet.

### Loading states

- [ ] First fetch (no cache): skeleton rows w/ shimmer keyframe.
- [ ] Subsequent: render stale, show 1px progress bar under topbar.
- [ ] Empty states: centered muted text per tab.

### Settings modal sections

- [ ] **GitHub**: PAT (validate on blur via `viewer` query), owner, repo, "Test connection"
- [ ] **Linear**: API key, team ID dropdown (after key validates)
- [ ] **Polling**: interval select, "Pause when hidden" toggle
- [ ] **Quiet hours**: start/end + days-of-week
- [ ] **Notifications**: master toggle + per-trigger checkboxes
- [ ] **Data**: Clear cache / Clear seen state / Reset all
- [ ] **About**: version, repo link, sign out

---

## Consolidated GraphQL additions

### GitHub query batched on each PRs poll
```graphql
query PrsTab($owner: String!, $name: String!, $awaitingQ: String!) {
  viewer { login name avatarUrl(size: 88) id }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url isDraft updatedAt createdAt
        author { login }
        headRefName baseRefName
        comments { totalCount }
        reviewThreads(first: 100) { nodes { comments { totalCount } } }
        reviewDecision
        reviews(last: 30) { nodes { state author { login } submittedAt } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
  search(query: $awaitingQ, type: ISSUE, first: 50) {
    nodes { ... on PullRequest {
      number title url isDraft createdAt
      author { login }
      reviewDecision
      reviews(last: 30) { nodes { state author { login } submittedAt } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT]) {
        nodes { ... on ReviewRequestedEvent {
          createdAt
          requestedReviewer { ... on User { login } ... on Team { slug } }
        } }
      }
    } }
  }
}
```

### Separate Insights search queries (one per metric, batched)
- `is:pr author:<login> created:<range>` → opened count + list for throughput
- `is:pr author:<login> merged:<range>` → merged count + list w/ createdAt/mergedAt for TTM
- `is:pr is:open review-requested:<login>` → queue
- `is:pr is:open` + `is:pr is:open updated:<lt now-7d>` + `is:pr is:open sort:created-asc first:1` → repo health
- `is:pr merged:<period>` → merges/day

### Turnaround query (10 min cadence)
```graphql
search(query: "is:pr is:closed repo:${repo} closed:>=${30d-ago}", type: ISSUE, first: 50) {
  nodes { ... on PullRequest {
    number createdAt closedAt mergedAt author { login }
    timelineItems(first:100, itemTypes:[REVIEW_REQUESTED_EVENT, PULL_REQUEST_REVIEW]) {
      nodes {
        ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } }
        ... on PullRequestReview { submittedAt author { login } state }
      }
    }
  } }
}
```

### Linear (4 queries, 5min cadence)
A. Viewer + teams · B. Active cycle · C. My cycle issues · D. Fallback my open issues. See `backend-linear.md` §3.

### REST endpoints

- `GET /repos/{o}/{r}/events?per_page=30` (Activity tab, ETag-conditional)
- `GET /repos/{o}/{r}/stats/contributors` (Insights, 1h cache, 202-retry)
- `GET /repos/{o}/{r}/stats/commit_activity` (Insights, 1h cache, 202-retry)

---

## Product decisions (LOCKED)

**PRs**:
1. Sort: **updatedAt** (existing, no change).
2. Render badges: **Draft only**. Skip pending-review badge.
3. Awaiting-review rows: **show unread bubbles**. Same SeenMap.
4. REFRESH: **bypass + reset gate**. Fetch now + reset 60s timer.

**Activity**:
5. Bot actors: **filter by default + settings toggle** to opt in.
6. Reopened events: **merge into OPENED** bucket.
7. Window: **fixed 7d**.
8. Timezone: **viewer local** (browser TZ).

**Insights**:
9. Repo rank basis: **commits in period**.
10. Stale count: **exclude drafts**.
11. `ALL` period: **cap 1000 PRs** w/ banner if exceeded.
12. CI fail rate: **exclude PENDING** first-commit rollups.
13. Delta color: **invert for lower-is-better** (TTM, CI fail rate → green ▼ on decrease).

**Linear**:
14. Multi-team: **auto-pick first** + override in Settings.
15. Ticket prefix: **any `[A-Z]+-\d+:`** (D-, CORE-, ENG-, etc.).
16. Cycle stats: **my tickets only** (personal velocity view).
17. Canceled tickets w/ open PR: **show as mismatch** (red MISMATCH flag).

**Chrome**:
18. Tab count `15`: **authored + awaiting** sum.
19. Repo crumb: **fixed label, click opens repo on GitHub**. Edit via Settings.
20. LIVE indicator: **app-wide**. Per-tab errors as inline banners.

---

## Phased build order (suggested)

**Phase 0 — refactor existing**
- Migrate to TanStack Query
- Hand-rolled hash router
- Settings modal w/ Linear key + Linear team fields
- Expand `SeenMap` shape (PRs unread already in code, just widen)

**Phase 1 — PRs tab full**
- Authored extensions (draft/pending badges, ntfy-style unread tracking)
- Awaiting Your Review query + view + summary bar
- Turnaround background query

**Phase 2 — Activity tab**
- REST `/events` with ETag
- Cadence sparkline + day-grouped stream
- Bot filter setting

**Phase 3 — Insights tab**
- Period toggle + persistence
- Personal contribution panel (avatar + stats + bar chart)
- 6 stat cards + 4 charts
- Multi-email setting

**Phase 4 — Linear tab**
- Linear settings (key + team)
- 4 GraphQL queries
- PR↔ticket mapping + mismatch detection
- Cycle progress bar

**Phase 5 — polish**
- Browser notifications + quiet hours
- Favicon badge w/ unread count
- Keyboard shortcuts
- Empty/loading/error states for every tab
- Cache hygiene (eviction, 2MB cap)

---

## Files

```
mocks/
  BACKEND_PLAN.md       ← this file (synthesis)
  backend-prs.md        ← PRs tab deep dive
  backend-activity.md   ← Activity tab deep dive
  backend-insights.md   ← Insights tab deep dive
  backend-linear.md     ← Linear tab deep dive
  backend-chrome.md     ← shared chrome/infra
  01-prs.html
  02-activity.html
  03-insights.html
  04-linear.html
  index.html
  shared.css
  MOCKS_README.md
```
