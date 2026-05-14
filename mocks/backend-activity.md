# Backend Requirements — Activity Tab

## 1. UI Element Inventory
- Topbar: brand, repo crumb (`corca-dev / corca-app`), user tag, `UPDATED Xm AGO`, LIVE dot, REFRESH, SETTINGS.
- Tabs: PRS (count 15), ACTIVITY (current), INSIGHTS, LINEAR.
- Section head: `REPO ACTIVITY // LAST 7 DAYS` + `38 EVENTS · CORCA-DEV/CORCA-APP` (total event count).
- Cadence panel: label `7D CADENCE` + composite `14 / 38 / 06`; 7-bar SVG sparkline; right stats `OPENED 14 / MERGED 18 / CLOSED 06`.
- Day blocks (TODAY · WED 13, YESTERDAY · TUE 12, MON 11 MAY) each with header (relative+absolute date) and `N EVENTS` meta.
- Activity rows: `HH:MM`, glyph (◆ merged green / ◇ opened amber / ◇ closed red), summary `@actor <verb> #PR <title>`, kind tag.

## 2. 7-Day Cadence Sparkline
Bars = total events/day for last 7 days (opened+merged+closed combined; mock shows single stack). Compute by bucketing events into 7 local-day bins.

Options:
- **A. GraphQL `repository.pullRequests(orderBy: UPDATED_AT)`** — fetch ~100 most-recently-updated PRs, inspect `createdAt`/`mergedAt`/`closedAt`. Pros: typed, one query, includes title/number/author. Cons: misses PRs updated >7d ago that closed inside window only via timestamps you already have; pagination heavy if repo is active.
- **B. Search API `repo:corca-dev/corca-app updated:>=YYYY-MM-DD`** — similar shape; counts as search rate-limit (30/min).
- **C. REST Events `/repos/{o}/{r}/events`** — paginated 30/page, max 300 events, 90-day window. Returns `PullRequestEvent` with `action: opened|closed|reopened` and `payload.pull_request.merged` flag.

**Recommendation: C (REST Events)** for sparkline + stream — single endpoint covers both, lighter on rate limits (5000/hr core REST vs 30/min search), and matches the "activity feed" semantic. Use ETag conditional requests (`If-None-Match`) so polling returns 304 and doesn't burn budget.

Pagination: fetch page 1 (30) then page 2 if oldest event still within 7d. Typical worst case 2–3 pages.

## 3. Cadence Stats
`OPENED/MERGED/CLOSED` counts derived from same 7-day event bucket. `MERGED` = `PullRequestEvent` where `action=closed && payload.pull_request.merged=true`. `CLOSED` = `action=closed && merged=false`. `OPENED` = `action=opened`. Reopened counted toward OPENED (or surfaced separately if desired). Composite header `14/38/06` matches OPENED/total/CLOSED; clarify with design (see Open Questions).

## 4. Day-Grouped Event Stream
Group events by viewer-local calendar day. Within day, sort DESC by timestamp. Show 7 days back; older days collapsed/hidden. All actors (repo-wide, not self). Each row needs: timestamp, actor login, kind, PR number, PR title, PR URL.

## 5. Per-Event Click Behavior
Anchor → `https://github.com/corca-dev/corca-app/pull/{number}` in new tab (`target="_blank" rel="noopener"`). No inline preview.

## 6. Day Divider Labels
`TODAY · WED 13`, `YESTERDAY · TUE 12`, then `MON 11 MAY` absolute. Compute in viewer's local timezone via `Intl.DateTimeFormat`. Events use ISO timestamps from API; format to `HH:mm` locally.

## 7. Empty States
- Zero events: render cadence with flat zero bars + `NO ACTIVITY IN LAST 7 DAYS`.
- API error: top-of-section banner `ACTIVITY FEED UNAVAILABLE — RETRY` + last-cached snapshot if present.
- Rate-limited (403/429): show `RATE LIMITED · RESUMES HH:MM` from `X-RateLimit-Reset`.

## 8. Polling
Poll Events endpoint every 60s using ETag → 304s are free (don't count against rate limit). Same cadence as PRs tab. Cache last successful payload in `localStorage` keyed by repo for cold-start.

## 9. Required Endpoints
- **Primary**: REST `GET /repos/corca-dev/corca-app/events?per_page=30&page=N` with `If-None-Match`. Filter client-side to `type === "PullRequestEvent"`.
- **Fallback / enrichment**: GraphQL `repository.pullRequests(first: 50, orderBy:{field:UPDATED_AT, direction:DESC})` if Events misses titles for PRs touched outside the window.

## 10. Data Shape
```ts
interface ActivityEvent {
  id: string;          // event.id
  timestamp: string;   // event.created_at ISO
  actor: string;       // event.actor.login
  kind: "opened" | "merged" | "closed" | "reopened";
  prNumber: number;
  prTitle: string;
  prUrl: string;
}

interface CadenceBucket { date: string; opened: number; merged: number; closed: number; }
interface ActivityFeed { totals: { opened: number; merged: number; closed: number }; cadence: CadenceBucket[]; days: { label: string; date: string; events: ActivityEvent[] }[]; etag?: string; fetchedAt: string; }
```

## 11. Open Questions
- Header `14 / 38 / 06` — middle `38` matches section "38 EVENTS" total, not MERGED 18; sparkline label likely means `opened / total / closed`. Confirm.
- Are `reopened` events shown? Mock shows none; default: merge into OPENED bucket.
- Should bot/CI actors be filtered (dependabot, github-actions)?
- Window fixed at 7 days or user-configurable (14/30)?
- Timezone source: viewer local vs repo-default (KST)?
