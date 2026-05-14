# Backend Requirements — Insights Tab

## 1. UI Element Inventory

Top-level layout (top → bottom):

1. **Topbar** — brand mark, repo crumb `corca-dev / corca-app`, user tag `sairambokka`, `UPDATED 00:42 AGO`, LIVE dot, REFRESH, SETTINGS. (Shared with all tabs.)
2. **Tabs** — PRS (count 15), ACTIVITY, INSIGHTS (current), LINEAR.
3. **Section head** — `INSIGHTS // ROLLING 30 DAYS` and `PERSONAL · REPO HEALTH`. Title string must reflect current period selection.
4. **Period toggle** — 5 buttons: `7D`, `30D` (default pressed), `90D`, `1Y`, `ALL`. `aria-pressed` toggles. Clicking refetches/recomputes all panels below.
5. **Personal contribution panel** (`.contrib-panel`):
   - Left cluster: avatar (44px square, monogram `SB`), `@sairambokka`, sub-line `28 COMMITS`, `+13,387` (green), `−1,723` (red).
   - Right cluster: `REPO RANK` label, value `#6` (accent color).
   - Below: bar chart SVG, viewBox 720×160. **21 bars** (~21 daily/weekly buckets). 6 bars rendered at 40% opacity ⇒ weekends. Y-axis labels `12 / 09 / 06 / 03 / 0`. X-axis labels `APR 14`, `APR 21`, `APR 28`, `MAY 05`, `MAY 12` (5 ticks ≈ weekly across a 30-day window).
6. **NEXT ACTION callout** (`.pr-of-day`): label `◆ NEXT ACTION`, title `D-2622: Esc key binding should close chat window`, meta `PR #2128 · CHANGES REQUESTED · 1D AGO`. Clickable → deep link to PR detail.
7. **Stat cards grid** (3×2, 6 cards):
   - A: `PRS OPENED` = 11, delta `+27% VS PREV 30D` (green ▲), foot `SAIRAMBOKKA · 30D`.
   - B: `PRS MERGED` = 08 (accent), delta `+12% VS PREV 30D`, foot `SAIRAMBOKKA · 30D`.
   - C: `MEDIAN TIME TO MERGE` = 2.4 DAYS, delta `-0.6D VS PREV 30D` (red ▼ — note: down delta but value improvement; see §5.C), foot `YOUR PRS`.
   - D: `YOUR REVIEW QUEUE` = 04, foot `OLDEST · 6D`. No delta.
   - E: `REPO OPEN PRS` = 31, foot `OLDEST · 18D · STALE: 7`. No delta.
   - F: `CI FAIL RATE (FIRST PUSH)` = 36%, delta `-4% VS PREV 30D` (red ▼ visually, but lower fail rate is good), foot `YOUR PRS · 30D`.
8. **Throughput chart card** (2/3 width). Title `PR THROUGHPUT // YOUR 30 DAYS`. Legend: amber `OPENED`, green `MERGED` (dashed). Two polylines, 31 points each (day buckets, 30D AGO → TODAY). Foot ticks `30D AGO`, `15D AGO`, `TODAY`.
9. **Top Reviewers card** (1/3 width). Label `YOUR TOP REVIEWERS`. 4 rows; each: `@handle`, horizontal bar (width proportional to top), count. Mock data: kyeo76=12, heeyoung-kim=8, park-jin=4, jw-lee=2.
10. **Commit Cadence card** (1/2 width). Label `COMMIT CADENCE · LAST 30D`. 30 vertical bars, 8 dimmed (weekends). Footer: `30D AGO`, `187 COMMITS · PEAK MON`, `TODAY`.
11. **Repo Health card** (1/2 width). Label `REPO HEALTH`. 2×2 mini-grid: `31 OPEN PRS`, `07 STALE > 7D` (red), `18d OLDEST OPEN` (accent), `4.2 MERGES / DAY`.

Interactions: period toggle, REFRESH, NEXT ACTION click, stat-card hover (optional tooltip), reviewer-row click (filter/open PR list), chart hover tooltip (date + value).

## 2. Period Toggle Behavior

- Options: `7D`, `30D`, `90D`, `1Y`, `ALL`. Default `30D`.
- Selection persists in URL (`?period=30d`) and localStorage.
- Section title must update: `INSIGHTS // ROLLING N DAYS` (or `INSIGHTS // ALL TIME`).
- All deltas compute vs previous window of equal length (e.g. 30D → prior 30D). For `ALL`, hide delta lines.
- For `ALL`: anchor to **repository creation date** (`repository.createdAt`). Not "user's first commit" — repo creation is unambiguous and consistent across users. Document this in tooltip on the `ALL` button.
- Period toggle triggers refetch but uses cache (§12) when fresh.

## 3. Personal Contribution Panel

- Avatar: prefer `viewer.avatarUrl` (GraphQL `User.avatarUrl(size: 88)`). Fallback to monogram from `viewer.login` initials if image fails.
- Handle: `viewer.login` prefixed with `@`.
- Commit count, lines added, lines removed: aggregate of commits authored by viewer to the default branch in the selected period.
- Repo rank: viewer's position when contributors are sorted DESC by commit count in the period.
- Bar chart: bars per **day** for ≤30D windows, per **week** for 90D/1Y/ALL. Weekend bars rendered at 40% opacity for daily mode.
- Data sources:
  - GraphQL `repository.defaultBranchRef.target ... on Commit { history(author: {id: <viewerId>}, since, until) { totalCount, nodes { committedDate, additions, deletions } } }`. Paginate (100/page).
  - Or REST `GET /repos/{owner}/{repo}/stats/contributors` for cheap weekly w/a/d/c. Use this for ranking; iterate `weeks[]` to sum within period.
  - Repo-wide cadence: REST `GET /repos/{owner}/{repo}/stats/commit_activity` (52 weeks × 7 days).
  - Both stats endpoints can return **202 Accepted** while computing; retry with exponential backoff (e.g. 1s, 2s, 4s) up to ~10s, then mark "still computing — refresh later".
- Ranking edge case: if `stats/contributors` lacks the viewer (rare for very new contributors), fall back to GraphQL history per top contributor and compute manually.
- Multi-email: query `viewer { emails: userEmails }` not available on `User`; instead use `User.id` for `history(author: {id})` which matches the linked GitHub account regardless of commit email. For commits authored under unlinked emails, supplement via `history(author: {emails: [...]})` with all known emails — surface a setting for user to add aliases.

## 4. "Next Action" Callout

- Pull from the same PR set as the PRS tab (open PRs involving viewer as author or reviewer).
- Priority ordering (descending):
  1. PR authored by viewer with `reviewDecision = CHANGES_REQUESTED` and an unread review comment.
  2. PR authored by viewer with `reviewDecision = APPROVED` and `statusCheckRollup.state = SUCCESS` and not yet merged (ready-to-merge).
  3. PR with review requested from viewer (in viewer's review queue) — oldest first.
  4. PR authored by viewer with unread comments.
- Computed **client-side** from existing PR-tab data; no separate endpoint.
- Empty state: replace with subdued `◆ NEXT ACTION — Inbox zero. Nothing waiting on you.`

## 5. Stat Cards

For all cards: value, optional delta `<sign><value> VS PREV <period>`, foot caption. Delta colors: ▲ green = up (good for opened/merged), ▼ red = down. For "median time to merge" and "CI fail rate", a *decrease* is good — UI should use green ▼ in those cases (current mock is wrong on coloring; document for implementer).

### Card A — PRS Opened
- Value: count of PRs where `author.login = viewer.login` and `createdAt` ∈ period.
- GraphQL `search(query: "repo:corca-dev/corca-app is:pr author:<login> created:<from>..<to>", type: ISSUE)` → `issueCount`.
- Delta vs prior window of equal length.

### Card B — PRS Merged
- `is:pr author:<login> merged:<from>..<to>` → `issueCount`. Accent-colored value.

### Card C — Median Time to Merge
- For PRs in (B), compute `mergedAt - createdAt`. Take median; render in **days** to 1 decimal.
- Need to paginate full merged PR list with timestamps via search → `... on PullRequest { createdAt, mergedAt }`.

### Card D — Your Review Queue
- Count of open PRs where viewer is in `reviewRequests.nodes[].requestedReviewer.login` AND viewer has not yet submitted a review.
- Query `is:pr is:open review-requested:<login>` → `issueCount`; for "OLDEST" foot, sort ASC by `createdAt` and take first.
- No period delta (review queue is point-in-time).

### Card E — Repo Open PRs
- `repository.pullRequests(states: OPEN) { totalCount }`.
- "OLDEST · Nd" = max age of open PR (`now - min(createdAt)`).
- "STALE: N" = open PRs with `updatedAt < now - 7d`. Threshold **7 days no activity**, configurable in SETTINGS.

### Card F — CI Fail Rate (first push)
- For viewer's PRs in period, determine the *first* commit's `statusCheckRollup.state` and check if it = `FAILURE`.
- GraphQL: `pullRequest.commits(first: 1) { nodes { commit { statusCheckRollup { state } } } }` — `commits` is chronological, so `first: 1` = initial push.
- Numerator = failures, denominator = PRs with at least one check on first commit (skip "no checks"). Render as integer %.
- Delta = pp change vs prior window.

## 6. Throughput Chart (line)

- X-axis: each day in selected period. For 1Y/ALL, switch to weekly buckets.
- Y-axis: integer count, auto-scaled (max + ~20% headroom). 3 gridlines.
- Series 1 (amber, solid): PRs **opened** per day by viewer (`createdAt` bucketed).
- Series 2 (green, dashed): PRs **merged** per day by viewer (`mergedAt` bucketed). May exceed opened on a given day (older PRs merging).
- Data: same dataset paginated for Card A and Card B + their merge timestamps. Compute buckets client-side.
- Hover tooltip: `MAY 03 · 2 opened · 3 merged`.
- Foot ticks adapt to period (`30D AGO / 15D AGO / TODAY`; for 1Y: `1Y AGO / 6M AGO / TODAY`).

## 7. Top Reviewers Bar

- Aggregate `reviews.nodes[].author.login` across viewer's PRs (any state) in period.
- One review per (PR, reviewer) — dedupe so a reviewer leaving 5 reviews on one PR counts as 1. (Or count submissions — document choice. Default: distinct PRs reviewed.)
- Sort DESC by count, take top **5** (mock shows 4; allow 4–6).
- Exclude `viewer.login` (self-review noise from `COMMENTED` events).
- Bar width = `count / max * 100%`.
- Row click → navigate to PRS tab filtered by reviewer.

## 8. Commit Cadence Chart

- 30 vertical bars = each day in last 30D (repo-wide, not viewer-specific).
- Source: REST `GET /repos/{owner}/{repo}/stats/commit_activity` — returns last 52 weeks; flatten last 30 days from `days[0..6]` of relevant weeks.
- Weekend bars (Sat/Sun) rendered at 40% opacity.
- Footer center text: total commits in window + peak weekday name (e.g. `187 COMMITS · PEAK MON`).
- 202 retry behavior as in §3.

## 9. Repo Health Card

| Cell | Source |
|---|---|
| OPEN PRS | `repository.pullRequests(states: OPEN).totalCount` |
| STALE > 7D | search `is:pr is:open updated:<now-7d` → `issueCount`; threshold matches Card E |
| OLDEST OPEN | `is:pr is:open sort:created-asc` first node → `now - createdAt` in days |
| MERGES / DAY | (count of `is:pr merged:<period>` ) ÷ (period length in days). Round to 1 decimal |

## 10. Avatar Source

- Primary: GraphQL `viewer.avatarUrl(size: 88)`.
- Fallback (image error or offline): CSS monogram, first letter of first + last word of `viewer.name` (or `login[0..1].toUpperCase()`).
- Cache avatar URL forever; GitHub serves a stable CDN URL.

## 11. Required Endpoints (consolidated)

**GraphQL queries (single batched query when possible):**
- `viewer { login, name, avatarUrl(size: 88), id }`
- `repository(owner, name) { createdAt, pullRequests(states: OPEN) { totalCount }, defaultBranchRef { target { ... on Commit { history(author: {id}, since, until, first: 100, after) { totalCount, pageInfo, nodes { committedDate, additions, deletions, oid } } } } } }`
- `search(query: "repo:... is:pr author:<login> created:<range>", type: ISSUE, first: 100, after) { issueCount, nodes { ... on PullRequest { number, title, createdAt, mergedAt, closedAt, state, reviewDecision, commits(first:1){nodes{commit{statusCheckRollup{state}}}}, reviews(first:50){nodes{author{login}, submittedAt, state}} } } }`
- `search(... merged:<range>)` — same shape; or merge with above and filter client-side.
- `search(... is:open review-requested:<login>)` for Card D.
- `search(... is:open sort:created-asc, first: 1)` for oldest open.
- `search(... is:open updated:<lt now-7d>)` for stale count.

**REST endpoints:**
- `GET /repos/{owner}/{repo}/stats/contributors` — for ranking + per-contributor weekly totals.
- `GET /repos/{owner}/{repo}/stats/commit_activity` — for commit cadence.
- (Both may return 202; retry.)

## 12. Caching Strategy

| Data | TTL | Notes |
|---|---|---|
| `viewer` (login/avatar/id) | 24 h | rarely changes |
| `repository.createdAt` | infinite | immutable |
| PR list (opened/merged/open) | 60 s | matches PRS tab refresh |
| Stat-card scalars derived from PR list | 60 s | recompute when PR list refreshes |
| Throughput buckets | 60 s | derived from PR list |
| Top reviewers aggregation | 5 min | review activity is lower-frequency |
| `stats/contributors` | 1 h | repo-wide weekly stats; expensive |
| `stats/commit_activity` | 1 h | same |
| Personal contribution chart (history) | 5 min | balance freshness vs cost |
| 202 retry: backoff 1s → 2s → 4s, cap 10s; treat 202 as cache-miss but show last-good if present |

Cache layer: in-memory + IndexedDB persistence keyed by `(query, period, viewer)`. Stale-while-revalidate: render cached then refetch.

## 13. Open Questions

- "Repo rank" basis: commits vs lines vs PRs merged? Default to **commits in period**; expose toggle later.
- Personal contribution bars: daily or weekly when period = 90D/1Y/ALL? Suggest weekly for 90D+, monthly for ALL.
- Card C delta color semantics: invert (down = green) for "lower is better" metrics? Recommend yes; flag for design review.
- Should "STALE" honor `draft` state? Drafts often updatedAt-stale by design — suggest excluding drafts from stale count.
- Multi-email author matching: prompt user to register additional commit emails? Or rely solely on `author.id` filter and accept under-count for un-linked commits?
- "Top reviewers": count distinct reviewed PRs vs total review submissions? Default to **distinct PRs**.
- `ALL` period perf cap: GitHub Search API is paginated and rate-limited; for ALL-time on large repos, may need to short-circuit at e.g. 1000 PRs and label "showing last 1000".
- CI Fail Rate: include PRs with `PENDING` first-commit rollup (still running)? Suggest exclude — only count once rollup is terminal.
- Refresh button: forces cache bypass for *all* panels or just stale ones? Recommend bypass all on this tab, since metrics are intentionally aggregated.
