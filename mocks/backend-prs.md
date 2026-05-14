# Backend Requirements — PRs Tab

Source mock: `mocks/01-prs.html`. Existing fetch: `src/lib/github.ts::fetchMyPRs`.

## 1. UI Element Inventory

### Topbar (`.topbar`)
| Element | Data required | Source | Action on click |
|---|---|---|---|
| `.brand-mark` + "PR.DASHBOARD" label | none | static | none |
| `.repo-crumb` `corca-dev / corca-app` | `settings.owner`, `settings.repo` | client state (`storage.ts::loadSettings`) | none (could open settings) |
| `.user-tag` `sairambokka` | `viewer.login` | GraphQL `viewer { login }` (already fetched) | none |
| `.ts` `UPDATED 00:42 AGO` | `lastSuccessfulFetchAt` timestamp | client state, recomputed every second | none |
| `.live-indicator` (`.live-dot` + "LIVE") | poll loop running flag | client state | none |
| `REFRESH` `.btn` | none | static | trigger immediate `fetchMyPRs` outside the 60s cadence |
| `SETTINGS` `.btn` | none | static | open settings dialog (PAT, owner, repo, interval) |

### Tab bar (`.tabs`)
| Element | Data required | Source | Action on click |
|---|---|---|---|
| `PRS` tab + `.tab-count` "15" | `authoredCount + awaitingReviewCount` (union, deduped) | derived from both queries | route to PRs view |
| `ACTIVITY` tab | none | static | route |
| `INSIGHTS` tab | none | static | route |
| `LINEAR` tab | none | static | route |

### Section head
| Element | Data required | Source | Action |
|---|---|---|---|
| `.section-title` "PULL REQUESTS // OPEN" | none | static | none |
| `.section-meta` "SORT: NEWEST" | sort key | client state | could become a dropdown (open question) |

### Segmented control (`.scope-toggle`)
| Element | Data required | Source | Action |
|---|---|---|---|
| `AUTHORED` button + count `11` | `authoredPRs.length` | existing query (filter by `author?.login === viewer.login`) | activate authored view |
| `AWAITING YOUR REVIEW` button + count `04` | `awaitingReviewPRs.length` | NEW `search` query (see §2) | activate review-queue view |

### Per-PR row (`.pr-row`, see §3)
Columns left→right: pr-num, octicon icon, title block, ci-dot, comment count, age, unread bubble. Row is `<a href>` → opens PR on github.com in new tab (`target="_blank" rel="noopener"`). Whole row is the click target; no per-element interaction inside the row.

States:
- `.pr-row.is-unread` — accent yellow left border + tinted gradient (authored view).
- `.pr-row.is-blocking` — red left border + tinted gradient (awaiting-review view only).
- `:hover` — yellow gradient overlay.

### Title-row inline badges
- `.tag.tag-approved` "▲ APPROVED" — green.
- `.tag.tag-changes` "▼ CHANGES REQUESTED" — red.
- `.tag.tag-blocking` "◆ BLOCKING <Nd>" — yellow accent (only awaiting-review view).
- (CSS also defines `.tag-pending`, `.tag-draft`; not used in mock but should render for `isDraft=true` and `reviewDecision=REVIEW_REQUIRED`).

### Summary bar (awaiting-review only) — `.summary-bar`, 4 cells
1. **PENDING** — count of awaiting-review PRs.
2. **BLOCKING ≥ 3D** — count where blocking-age ≥ 3 days. Value rendered with `.danger` class.
3. **AVG TURNAROUND** — mean time-to-first-review across recently-closed/merged PRs.
4. **OLDEST** — max blocking-age in days. Red when ≥ some threshold.

### Divider
- `.divider-block` with dashed top border and `.divider-label` "↓ PREVIEW — TOGGLE = AWAITING YOUR REVIEW". This is a mock-only artifact and is NOT rendered in production — the two views are mutually exclusive based on segmented-control state.

---

## 2. Segmented Control: Authored vs Awaiting Review

### Authored (existing)
Existing `repository.pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC})` then client-side `filter(p.author.login === viewer.login)`. Returns up to 50 open PRs across the repo, narrowed to the viewer.

Limitations: capped at 50 most recently updated open PRs; if the user authors a stale PR it could fall off. Acceptable for single-repo single-author dashboard.

### Awaiting Your Review (NEW)
Best option: GraphQL `search` connection. Single query covers the case GitHub already understands ("review-requested by me"):

```graphql
search(query: "is:pr is:open review-requested:@me repo:corca-dev/corca-app",
       type: ISSUE, first: 50) {
  nodes { ... on PullRequest { <same fields as authored> reviewRequests(first:10) { nodes { requestedReviewer { ... on User { login } } } } } }
}
```

Why `search` over `repository.pullRequests`:
- `repository.pullRequests` has no `reviewRequested` filter argument — would force fetching all open PRs and client-filtering reviewRequests.nodes, blowing the rate budget.
- `search` accepts `review-requested:@me`, `team-review-requested:`, `user-review-requested:`. Matches GitHub's own "Review requests" list semantics. Includes team-mention review requests transparently.

Tradeoffs: `search` has stricter rate limits (30 pts/min vs core 5000/hr) but each call is one point; fine for a 60s poll. Result objects need `... on PullRequest` inline fragment.

### Counts on toggle buttons
- "AUTHORED" count = `authoredPRs.length` (post-filter).
- "AWAITING YOUR REVIEW" count = `awaitingReviewPRs.length` (post-fetch).
- The top-level `PRS` tab badge = `unique union` of both lists by PR number (a user could author AND have been re-requested as reviewer — rare, dedupe defensively).

Counts are zero-padded to two digits in the mock (`"04"`, `"11"`). Padding is presentation; backend exposes integers.

---

## 3. Per-Row Data Requirements

| Column | Field | Source | Edge cases |
|---|---|---|---|
| `.pr-num` `#2197` | `number` | GraphQL `PullRequest.number` | always present |
| Octicon `.gitpr-icon` | none — colour static `#4ade80` (mock); should branch on state | client-derived | OPEN→green (`#4ade80`); DRAFT→muted grey; MERGED/CLOSED won't appear (we filter `states: OPEN`) |
| `.pr-title` | `title` | GraphQL `PullRequest.title` | truncate with `text-overflow: ellipsis` (CSS handles) |
| Approved badge | `effectiveReview === "APPROVED"` | derived (§6) | hide when null |
| Changes-requested badge | `effectiveReview === "CHANGES_REQUESTED"` | derived (§6) | hide when null |
| Blocking badge | `blockingDays >= 1` in awaiting-review view | derived (§8) | only awaiting-review view |
| Draft badge (CSS exists, not in mock) | `isDraft` | `PullRequest.isDraft` | render `.tag-draft` "○ DRAFT" |
| `.pr-meta .author` `sairambokka` | `author.login` | `PullRequest.author.login` | author can be null (deleted user); fallback `"ghost"` |
| `.pr-meta` branch `feat/inequality-phantom` | `headRefName` | `PullRequest.headRefName` | always present |
| `.ci-col .dot` | `ciState` | `commits(last:1).statusCheckRollup.state` | `SUCCESS`→`.dot-success`; `FAILURE`/`ERROR`→`.dot-fail`; `PENDING`/`EXPECTED`→`.dot-pending`; `null` (no commits yet OR no checks configured)→`.dot-none` |
| `.comment-col` `○ 01` | `totalCommentCount` | `comments.totalCount + Σ reviewThreads.nodes[].comments.totalCount` (existing) | zero-pad to 2 digits in render; "○" glyph is static |
| `.age-col` `02h` / `01d` / `6D` | derived from `createdAt` (authored) OR review-request-added timestamp (awaiting) | see §8 for awaiting; for authored use `createdAt` formatted `<24h → "NNh"`, `≥24h → "NNd"` | drop hours over 24, drop days under 1 |
| `.bubble-slot .bubble` "3" | `unreadCount` (§5) | client state diff | absent when 0; awaiting-review view in mock omits bubble slot entirely (open question §9) |

---

## 4. Summary Bar (Awaiting Review)

| Cell | Compute | Source | Window |
|---|---|---|---|
| PENDING | `awaitingReviewPRs.length` | live query | now |
| BLOCKING ≥ 3D | `awaitingReviewPRs.filter(blockingDays >= 3).length` | derived (§8) | now |
| AVG TURNAROUND | mean over recently-closed PRs of `firstReviewAt − reviewRequestedAt` (excluding viewer's own reviews) | NEW query — see below | rolling 30 days, configurable later |
| OLDEST | `max(blockingDays)` across awaiting list, formatted `Nd` | derived (§8) | now |

### Avg turnaround query (NEW)
```graphql
search(query: "is:pr is:closed repo:corca-dev/corca-app closed:>={30d-ago}",
       type: ISSUE, first: 50) {
  nodes { ... on PullRequest {
    number createdAt closedAt
    timelineItems(first:50, itemTypes:[REVIEW_REQUESTED_EVENT, PULL_REQUEST_REVIEW]) {
      nodes {
        ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } }
        ... on PullRequestReview   { submittedAt author { login } state }
      }
    }
  } }
}
```

Compute per PR: for each `ReviewRequestedEvent`, find earliest subsequent `PullRequestReview` (state ≠ `PENDING`) by a different author. Take that delta. Average across all PRs in window. Discard reviews authored by the original PR author.

Display: "1.8 D" with one decimal place when value < 10 days; otherwise integer.

Edge: empty window → render `—`.

---

## 5. Unread Bubble Logic

### Current behaviour (already wired)
- `SeenMap` in localStorage: `{ [prNumber]: lastSeenTotalCommentCount }`.
- On each fetch: `unread = totalCommentCount − seen[number]`. If `unread > 0` → `.is-unread` class + bubble.
- Clicking the row should mark seen: write current `totalCommentCount` into `SeenMap`, clearing bubble.

### Should it expand to match ntfy logic?
Recommend yes — track three signals per PR, hash them, store the hash as the "seen" key:
```ts
type SeenEntry = {
  totalComments: number;
  latestReviewSubmittedAt: string | null;  // max(reviews[].submittedAt)
  ciState: PRSummary["ciState"];           // value at last view
};
```
A row is unread when any of: `totalComments` increased, `latestReviewSubmittedAt` advanced, OR `ciState` transitioned to FAILURE/ERROR since last seen. The bubble number remains `Δ commentCount` (so it stays the visible metric) but the highlight gradient triggers for any of the three signals — matches "anything happened on this PR" intuition the mobile push gives.

### State storage shape (update `storage.ts`)
```ts
export type SeenMap = Record<number, SeenEntry>;
```
Migration: existing `Record<number, number>` entries treated as `{ totalComments: <num>, latestReviewSubmittedAt: null, ciState: null }`.

### Click-to-clear
On row click: write current snapshot into `SeenMap[number]`, persist, then `window.open(pr.url, "_blank")`. Do NOT navigate away (this is a static SPA — opening in a new tab keeps the dashboard alive for the poll loop).

---

## 6. Review-State Badges

Final logic (already implemented in `github.ts`, re-affirmed here):

```
latestByAuthor = Map<login, ReviewState>
for r in reviews.nodes (last 30):
  skip if r.author == viewer
  skip if r.state in {COMMENTED, PENDING, DISMISSED}
  upsert latestByAuthor[r.author.login] = r.state  (keep newest by submittedAt)
approvers          = [a for a, s in latestByAuthor if s == APPROVED]
changeRequesters   = [a for a, s in latestByAuthor if s == CHANGES_REQUESTED]

effectiveReview =
  CHANGES_REQUESTED if (reviewDecision == CHANGES_REQUESTED OR changeRequesters.length > 0)
  else APPROVED     if (reviewDecision == APPROVED         OR approvers.length        > 0)
  else null
```

Why both: `reviewDecision` is GitHub's authoritative summary (respects branch protection rules / CODEOWNERS) but goes `null` when no review yet. The per-author scan catches single approvals on PRs without required-reviewer config. Union covers both cases.

DISMISSED is intentionally excluded — a dismissed approval is no longer effective. Render rules:
- `effectiveReview === "APPROVED"` → `<span class="tag tag-approved">▲ APPROVED</span>`
- `effectiveReview === "CHANGES_REQUESTED"` → `<span class="tag tag-changes">▼ CHANGES REQUESTED</span>`
- `isDraft === true` → `<span class="tag tag-draft">○ DRAFT</span>` (not in mock but CSS ready; should render).
- `reviewDecision === "REVIEW_REQUIRED" && !effectiveReview && !isDraft` → optionally render `<span class="tag tag-pending">○ REVIEW REQ</span>` (open question §9).

Multi-state: a PR with both `APPROVED` and `CHANGES_REQUESTED` reviewers resolves to `CHANGES_REQUESTED` (block wins).

---

## 7. CI Dot

Source: `commits(last:1).nodes[0].commit.statusCheckRollup.state` — already fetched.

Mapping:
| `ciState` | Class | Colour | Glow |
|---|---|---|---|
| `SUCCESS` | `.dot-success` | green `#4ade80` | yes |
| `FAILURE` | `.dot-fail` | red `#ef4444` | yes |
| `ERROR` | `.dot-fail` | red | yes |
| `PENDING` | `.dot-pending` | yellow `#fbbf24` | yes |
| `EXPECTED` | `.dot-pending` | yellow | yes |
| `null` (no commits, no checks configured, or checks not yet reported) | `.dot-none` | grey `var(--border-2)` | no |

Edge: PR with zero commits (just opened, immediately closed) — `commits.nodes` is empty array; treat as null. Don't crash.

GitHub also returns the legacy `state` enum on `StatusCheckRollup`; we use that. The richer `contexts` payload (per-check breakdown) is NOT needed for the dot — defer until tooltip work.

---

## 8. Blocking Row Indicator (Awaiting Review)

### Timestamp source
Measured from the **review-request-added timestamp for the viewer**, NOT `createdAt` or `updatedAt`. A PR opened 5 days ago but re-requested today should show 0d, not 5d. GraphQL path:

```graphql
timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT]) {
  nodes {
    ... on ReviewRequestedEvent {
      createdAt
      requestedReviewer { ... on User { login } ... on Team { name } }
    }
  }
}
```

Compute: `blockingSinceAt = max(t.createdAt for t in events if requestedReviewer.login == viewer.login OR viewer is on requestedReviewer team)`. The "max" handles re-requests (e.g. after a force-push).

Fallback: if no `ReviewRequestedEvent` for the viewer exists (edge case — viewer was assigned via `assignees` rather than reviewers), fall back to `PullRequest.createdAt`.

`blockingDays = floor((now - blockingSinceAt) / 1 day)`.

### Visual states
| Threshold | Row class | Badge class | Age column class |
|---|---|---|---|
| `blockingDays >= 3` | `.is-blocking` (red border + tint) | `.tag-blocking` "◆ BLOCKING Nd" | `.blocking-old` (red, bold) |
| `1 <= blockingDays < 3` | no row tint | no inline badge (mock shows none) | `.blocking-warn` (yellow, bold) |
| `blockingDays == 0` | no row tint | no badge | default muted age column |

Note the mock badge text `"◆ BLOCKING 6D"` includes the day count — emit `${blockingDays}D`.

---

## 9. Open Questions

1. **Awaiting-review view unread bubbles.** Mock shows empty `.bubble-slot` for awaiting-review rows. Should unread tracking apply to PRs the viewer is reviewing (new comments since they last visited)? Reasonable yes — same `SeenMap` keyed by PR number; mock may simply have omitted the column for layout.
2. **Sort order.** Mock says "SORT: NEWEST". Is "newest" by `createdAt` or `updatedAt`? Existing query uses `UPDATED_AT`. Confirm intent; possibly expose a dropdown.
3. **REVIEW_REQUIRED pending badge.** Should a PR with no reviews yet show `tag-pending`? CSS class exists but mock doesn't render it on authored rows. Decision needed.
4. **DRAFT badge.** `isDraft` is fetched but mock has no draft PR. Confirm rendering decision: `.tag-draft` "○ DRAFT" in title row?
5. **Multi-repo.** Document title says "single-repo". `search` query hardcodes `repo:corca-dev/corca-app`; if multi-repo is on the roadmap, parametrise sooner.
6. **Team-review requests.** Viewer may be requested via team, not directly. Need to fetch viewer's teams (`viewer.organizations.nodes.teams`) and match `requestedReviewer { ... on Team }` against them, OR rely on `review-requested:@me` in search (which already covers team-via-mention case).
7. **Avg turnaround window.** Hardcode 30 days or make configurable? And which timestamp pair: `reviewRequested → firstReview` (recommended) vs `createdAt → mergedAt`?
8. **Oldest cell colour threshold.** `.danger` is applied in mock at 6d. What's the cutoff — same 3d as the BLOCKING summary, or a separate threshold (e.g. 5d)?
9. **Repo crumb interactivity.** Should clicking it open settings, or stay static?
10. **Refresh button.** Confirm it bypasses the 60s gate AND resets the gate, vs. just forcing one extra fetch.

---

## 10. Required GraphQL Schema Changes

Additions only — no removals. Existing `QUERY` stays for the Authored tab.

### A. Extend the existing query (per-PR additions)
Append inside `pullRequests.nodes`:
```graphql
createdAt                                # (already present)
isDraft                                  # (already present)
timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT]) {
  nodes {
    ... on ReviewRequestedEvent {
      createdAt
      requestedReviewer {
        ... on User { login }
        ... on Team { name slug }
      }
    }
  }
}
reviewRequests(first: 10) {
  nodes {
    requestedReviewer {
      ... on User { login }
      ... on Team { name slug }
    }
  }
}
```

### B. New top-level query for awaiting review
```graphql
query AwaitingReview($searchQ: String!) {
  search(query: $searchQ, type: ISSUE, first: 50) {
    issueCount
    nodes {
      ... on PullRequest {
        number title url isDraft updatedAt createdAt
        author { login }
        headRefName baseRefName
        comments { totalCount }
        reviewThreads(first: 100) { nodes { comments { totalCount } } }
        reviewDecision
        reviews(last: 30) { nodes { state author { login } submittedAt } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        timelineItems(first: 50, itemTypes: [REVIEW_REQUESTED_EVENT]) {
          nodes { ... on ReviewRequestedEvent {
            createdAt
            requestedReviewer { ... on User { login } ... on Team { name slug } }
          } }
        }
      }
    }
  }
}
```
Variable: `searchQ = "is:pr is:open review-requested:@me repo:${owner}/${repo}"`.

### C. New top-level query for Avg Turnaround
```graphql
query Turnaround($searchQ: String!) {
  search(query: $searchQ, type: ISSUE, first: 50) {
    nodes {
      ... on PullRequest {
        number createdAt closedAt mergedAt
        author { login }
        timelineItems(first: 100, itemTypes: [REVIEW_REQUESTED_EVENT, PULL_REQUEST_REVIEW]) {
          nodes {
            ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } }
            ... on PullRequestReview   { submittedAt author { login } state }
          }
        }
      }
    }
  }
}
```
Variable: `searchQ = "is:pr is:closed repo:${owner}/${repo} closed:>=${ISOdate(now-30d)}"`. Polled less frequently — every 10 minutes is fine; cache result.

### D. Viewer team membership (for team-review matching in §8)
Optional, fetch once per session:
```graphql
viewer {
  login
  organizations(first: 10) {
    nodes {
      login
      teams(first: 20, userLogins: ["__viewer__"]) { nodes { slug } }
    }
  }
}
```
Skip if "AWAITING YOUR REVIEW" uses `search` `review-requested:@me` (which already resolves team membership server-side); only needed if we want to display *why* the viewer was requested.

### Rate-budget summary
- Authored poll (60s): 1 query, ~1 point.
- Awaiting-review poll (60s, when toggle active): 1 search query, 1 point against 30/min search budget.
- Turnaround (600s): 1 search query.
- Total per minute: 2-3 search-budget points, well under limit.

### Type additions in `github.ts`
Add to `PRSummary`:
```ts
blockingSinceAt: string | null;        // ISO timestamp; null on authored view
blockingDays: number | null;
reviewRequestedReviewers: Array<{ kind: "user" | "team"; name: string }>;
```
Plus a separate `TurnaroundStat = { avgDays: number | null; oldestDays: number | null; pending: number; blocking3d: number }` shape returned alongside the awaiting-review list.
