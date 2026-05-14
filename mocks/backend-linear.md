# Backend Requirements — Linear Tab

## 1. UI Element Inventory

### Top chrome (shared)
- Brand: `PR.DASHBOARD`
- Repo crumb: `corca-dev / corca-app`
- User tag: `sairambokka`
- Topbar actions: `UPDATED 00:42 AGO`, live dot + `LIVE`, `REFRESH`, `SETTINGS`
- Tabs row: `PRS 15`, `ACTIVITY`, `INSIGHTS`, `LINEAR` (current)

### Section head
- Title: `LINEAR // PR ↔ TICKET LINK`
- Meta: `CYCLE 24 · CORCA-DEV / SYMPY-HINTS`

### Cycle bar (3-column grid)
- Left: label `CYCLE 24` with strong `SYMPY HINTS · D2`
- Middle: progress bar at `62%` width, vertical tick mark at `62%`, date row underneath: `06 MAY` / `WED · DAY 8 / 14` / `20 MAY`
- Right stats: `DONE 9 / IN-PROG 4 / TODO 3`, second line `SCOPE 16 · BURNED 56%`

### Table header row
Column labels: `TICKET`, (blank for badge), `TITLE`, `STATUS` (mismatch hint slot), (blank arrow), `PR`, `PR STATE`, (blank)

### Table body — linked rows (8)
| Ticket | Status badge | Title | Mismatch? | PR # | PR state cell |
|---|---|---|---|---|---|
| D-2663 | IN REVIEW (blue) | Implement Tailor Series using Sympy | — | 2162 | `▲ APPROVED` tag |
| D-2656 | IN PROGRESS (yellow) | Fix derivative parsing in sympy for higher order derivatives | `▼ MISMATCH` | 2145 | `◆ MERGED 13:38` green text |
| D-2622 | IN PROGRESS | Esc key binding should close chat window (Team + Chatbot) | — | 2128 | `▼ CHANGES` tag |
| D-2646 | IN PROGRESS | Inequality solution-set hints (∈ trigger) | — | 2185 | `OPEN · 02D` dim |
| D-2614 | IN PROGRESS | Support for degrees in postfix units inside sympy | — | 2168 | `OPEN · 01D` dim |
| D-2655 | TODO (gray) | Update phantomHint suggestion not to trigger for symbol except '=' | — | 2147 | `DRAFT` dim |
| D-2567 | IN PROGRESS | Add cursor inside units for continuous typing | — | 2127 | `OPEN · 02D` dim |
| D-2701 | BLOCKED (red) | Add OpenSearch index for matrix expressions | — | 2154 | `◆ AWAITING YOUR REVIEW` accent |

### Dimmed rows (no linked PR, `opacity: 0.55`)
- D-2730 · TODO · "Rails 7.2 upgrade prep (no PR linked yet)" · arrow `—` · PR cells `—`
- D-2738 · TODO · "Mobile: handle deep-link to PR comment thread" · arrow `—` · PR cells `—`

### Visual treatments
- Mismatch row: left-border 2px red, soft red gradient bg
- Status badge: 1px border + colored text (5 variants: TODO/IN PROGRESS/IN REVIEW/DONE/BLOCKED)
- Arrow `→` between ticket and PR sides; `—` when no PR
- Ticket-id and PR# in mono font; ticket id rendered with accent color
- Whole row is an anchor (click target)

## 2. Linear Authentication
- Personal API Key generated at https://linear.app/settings/api
- Stored in `localStorage` alongside GitHub PAT (key: `linear_api_key`)
- Settings panel gets NEW field `Linear API Key` (password input, show/hide toggle)
- Optional: `Linear Team ID` filter field
- All requests: `POST https://api.linear.app/graphql` with header `Authorization: <key>` (Linear accepts the raw key — no `Bearer ` prefix for Personal API Keys; OAuth tokens use `Bearer`)
- 401 → surface "Invalid Linear key" banner; do not poll until fixed

## 3. Required Linear GraphQL Queries

### Query A — viewer + active cycle
```graphql
query Viewer {
  viewer {
    id
    name
    email
    teams { nodes { id key name } }
  }
}
```

### Query B — active cycle for a team
```graphql
query ActiveCycle($teamId: String!) {
  cycles(
    filter: { team: { id: { eq: $teamId } }, isActive: { eq: true } }
    first: 1
  ) {
    nodes {
      id
      number
      name
      startsAt
      endsAt
      progress
      scopeHistory
      completedScopeHistory
      issueCountHistory
      completedIssueCountHistory
    }
  }
}
```

### Query C — my tickets in the active cycle
```graphql
query MyCycleIssues($cycleId: String!) {
  issues(
    filter: {
      assignee: { isMe: { eq: true } }
      cycle: { id: { eq: $cycleId } }
    }
    first: 100
  ) {
    nodes {
      id
      identifier        # "D-2663"
      title
      url
      priority
      state { id name type color }   # type ∈ backlog|unstarted|started|completed|canceled
      cycle { id number }
      updatedAt
    }
  }
}
```

### Query D — fallback: my open issues (when cycle filter is empty)
```graphql
query MyOpenIssues {
  issues(
    filter: {
      assignee: { isMe: { eq: true } }
      state: { type: { nin: ["completed","canceled"] } }
    }
    first: 100
  ) { nodes { id identifier title url state { name type } cycle { id number } } }
}
```

## 4. PR ↔ Ticket Mapping
- Parse `^([A-Z]+-\d+):` from each open PR title (case-insensitive). Capture = ticket identifier.
- Build `Map<identifier, PR>` from existing GitHub PR query.
- Build `Map<identifier, Issue>` from Linear Query C.
- Render union, keyed by `identifier`:
  - Both present → linked row
  - Only Linear → dimmed row at bottom
  - Only PR (no `D-NNNN:` prefix) → out of scope for this tab (shows on PRs tab only)

## 5. Mismatch Detection
Rules (compute client-side):
- Ticket type ∈ {`unstarted`,`started`} AND PR merged → **MISMATCH** (red, `▼ MISMATCH`)
- Ticket type = `completed` AND PR open/draft → **MISMATCH** (red)
- State name = "Blocked" AND PR open → **INFO** (amber, non-blocking) — not currently shown in mock but reserved
- State name = "In Review" AND PR draft → **INFO** (amber)
- State name = "In Review" AND PR has CHANGES REQUESTED → **MISMATCH** (red)
- Otherwise → no flag

## 6. Cycle Progress Bar
- Fill width = `Math.round(progress * 100)%` from `cycle.progress`, OR computed from `(today - startsAt) / (endsAt - startsAt)` if `progress` is null
- Tick mark at same %
- Date row: short date of `startsAt`, weekday + `DAY X / N` for today, short date of `endsAt`
- Stats: counts grouped by `state.type` (completed → DONE, started → IN-PROG, unstarted/backlog → TODO); `SCOPE` = total issues in cycle; `BURNED` = `completedScopeHistory.last / scopeHistory.last`

## 7. Status Badges
Map by `state.type` (5 fixed Linear types) but display `state.name`:
| Linear type | Badge class | Color |
|---|---|---|
| `backlog`, `unstarted` | `status-todo` | muted gray |
| `started` | `status-progress` | yellow |
| `started` + name matches `/review/i` | `status-review` | blue |
| `completed` | `status-done` | green |
| `canceled` | `status-todo` (muted) | gray |
| name matches `/blocked/i` (any type) | `status-blocked` | red |

Note: Linear allows custom workflow states. Resolve "In Review" and "Blocked" by name match because they are not first-class types.

## 8. PR State Column
Reuses GitHub data (existing PR query). States rendered identical to PRs tab:
`APPROVED`, `CHANGES REQUESTED`, `OPEN · NNd`, `DRAFT`, `MERGED HH:MM`, `AWAITING YOUR REVIEW`.

## 9. Sort Order
1. Linked rows in active cycle, sorted by status: IN REVIEW → IN PROGRESS → TODO → BLOCKED → DONE
2. Tie-break by `updatedAt` desc
3. Dimmed rows (Linear-only, no PR) last, sorted by status then identifier

## 10. Settings Panel Changes
New `Linear` section:
- `Linear API Key` (masked text input)
- `Linear Team ID` (optional dropdown, populated from Query A `viewer.teams.nodes`)
- `Show only active cycle` toggle (default ON)

## 11. Polling Cadence
- Linear: 5-minute interval (issues + active cycle)
- Reuse 60s GitHub poll for PR state column only
- Manual `REFRESH` button forces both
- Throttle: never below 30s; respect Linear rate limit (1500 req/hr/team)

## 12. Click Behavior
- Row anchor splits into two click targets:
  - Click ticket id / status badge / title → `window.open(issue.url, '_blank')`
  - Click PR # / PR state cell → `window.open(pr.html_url, '_blank')`
- Use `stopPropagation()` on PR cells to prevent the row's Linear handler from firing
- Dimmed rows: ticket-side opens Linear; PR-side is inert (`—`)

## 13. Open Questions
- Authorization header format for Personal API Keys vs OAuth — verify in docs
- Multi-team users: pick first team or require selection?
- Should canceled tickets appear if linked PR is open?
- Cycle stats — show all-team or my-assignee-only counts? (Mock numbers suggest all-team)
- "AWAITING YOUR REVIEW" originates from GitHub review-requests, not Linear; confirm cross-source rendering
- How to handle ticket prefixes other than `D-` (e.g. `CORE-`, `ENG-`)?

## 14. Required Endpoints / Schemas

### External
- `POST https://api.linear.app/graphql` — Queries A, B, C, D
- Existing GitHub queries (PRs list + review state) — no new endpoints

### TypeScript types
```ts
type LinearStateType = 'backlog'|'unstarted'|'started'|'completed'|'canceled';

interface LinearIssue {
  id: string;
  identifier: string;        // "D-2663"
  title: string;
  url: string;
  priority: number;
  state: { id: string; name: string; type: LinearStateType; color: string };
  cycle: { id: string; number: number } | null;
  updatedAt: string;
}

interface LinearCycle {
  id: string;
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  progress: number;          // 0..1
  scopeHistory: number[];
  completedScopeHistory: number[];
}

interface LinkedRow {
  identifier: string;
  issue: LinearIssue;
  pr: GitHubPR | null;       // null → dimmed row
  mismatch: 'none' | 'error' | 'info';
}
```

### LocalStorage keys
- `linear_api_key: string`
- `linear_team_id?: string`
- `linear_show_active_cycle_only: boolean`
