# PR Dashboard — UI Mocks

Static HTML mockups for proposed redesign. **Not committed to main app yet.** Review, iterate, then port to React.

## How to view

```bash
cd ~/Documents/pr-dashboard/mocks
python3 -m http.server 8000
# open http://localhost:8000
```

Or open `index.html` directly in a browser.

## Aesthetic direction

**Industrial terminal / Bloomberg-meets-Linear.** Instrument-panel feel. Signal density, no decoration. Refined minimalism — sparse use of accent color creates visual hierarchy.

### Commitments

| Axis | Choice |
|------|--------|
| Tone | Industrial / utilitarian, refined minimalism |
| Canvas | `#0a0a0a` (off-true-black, OLED-safe) |
| Accent | Amber `#ffb700` (phosphor-CRT vibe, distinctive vs cyan) |
| Type | JetBrains Mono only — single mono brand, no display/body split |
| Type scale | 10 / 11 / 12 / 13 / 14 / 24 / 28 / 36px — discrete steps |
| Numerics | Tabular nums on every count, timestamp, ID |
| Corners | 0px (sharp) — no rounded pills, no GitHub softness |
| Borders | 1px `#1f1f1f` — barely visible, organize without shouting |
| Spacing | 8 / 16 / 24 / 32 / 48px rhythm |
| Icons | Unicode geometric chars (◆ ◇ ▲ ▼ ○ ●) — no SVG icon library, no emoji |
| Motion | One pulsing live-dot, staggered row fade-in on load. Nothing else. |
| Overlay | 1px scanline pattern, very subtle (overlay blend, 1.2% white) |

### Color usage rule

Accent (amber) used ONLY for:
- Active tab indicator
- Brand mark dot
- Live-dot pulse
- Selected filter chip background
- Unread bubble (filled)
- Hyperlinks within event summaries
- "Blocking" / "Mismatch" / "Next Action" emphasis

Greens / reds / yellows used **only** for status semantics (CI, review state, ticket state). Never decorative.

### Component shapes

**Tags / badges**: rectangular, ~3px vertical padding, monospace small caps, single-pixel border with semantic color. No pills.

**Unread bubble**: 20px square-ish, filled amber, black text, square corners. Reads as a callout, not a candy decoration.

**CI dot**: 7px circle with subtle glow (box-shadow). Green/red/yellow.

**PR icon (octicon)**: kept GitHub's git-pull-request glyph for instant recognition. Tinted green for open, purple for merged, gray for draft.

## Per-page notes

### 01-inbox.html
Default landing tab. Chronological event stream grouped by day. Filter chip row at top. Event types: comments / reviews / CI / mentions. Unread rows tinted amber, fade after first view. Click = open PR in new tab + mark read.

### 02-my-prs.html
Current "My PRs" redesigned in this aesthetic. Two-line layout: title row + meta row (author/branch). Unread rows have 2px amber left border + gradient wash + bubble. Otherwise plain.

### 03-reviews-needed.html
New tab — PRs where you're review-requested. Summary bar at top (pending / blocking ≥3d / your avg turnaround). Rows blocking ≥3d get amber accent left border + amber "BLOCKING Nd" tag. <3d gets dim accent. Sorted oldest first.

### 04-activity.html
Repo-wide recent activity. 7-day cadence sparkline at top (opened/merged/closed counts). Events grouped by day. Different icons for merge (◆) / open (◇) / close.

### 05-insights.html
Stat grid + 2 SVG charts. "Next Action" callout at top — single highest-priority PR for you today (e.g. "Changes Requested on 2128"). 6 stat cards (PRs opened/merged/median TTM/your review queue/repo open count/CI fail rate). Two-column lower section: 30d throughput line chart + top-reviewers bar chart + commit cadence + repo health card.

### 06-linear.html
Linear ticket ↔ PR map. Cycle progress bar at top (Cycle 24, day 8/14, 62%). Table: ticket ID / status badge / title / link arrow / PR # / PR state. **Mismatch detection**: when ticket = "In Progress" but PR = "Merged" — row gets red accent + "MISMATCH" tag. Tickets without linked PR dimmed at bottom.

## Open questions / iteration points

1. **Density vs whitespace**: rows are currently 14–16px padding. Linear is tighter (~10px). Want denser? Looser?
2. **Bubble shape**: currently squared-off corners. Want fully circular like Slack, or keep square for utilitarian feel?
3. **Accent color**: amber vs cyan vs sage green vs pure white-on-black. Open to swap if amber feels too "Bloomberg-y."
4. **Font**: JetBrains Mono throughout. Considered Berkeley Mono (paid) or IBM Plex Mono. Want to test alternatives?
5. **Scanline overlay**: 1.2% opacity. Too subtle? Too much? Drop entirely?
6. **Tabs**: 6 tabs. Possible to fold Activity into Insights, or Linear into a side panel, to reduce tab fatigue?
7. **Insights metrics**: do the 6 cards capture what you'd actually want to glance at, or are they vanity?
8. **Linear "Mismatch" detection**: useful safeguard, or annoying false-positives?

## What's NOT in mocks

- Cmd+K command palette (mentioned in brainstorm)
- Keyboard nav (j/k/o/m)
- Snooze / saved views UX
- Settings modal redesign
- Empty states
- Loading skeletons
- Error states
- Mobile layout

These are second-pass.

## Suggested next step

1. Open `index.html`, click through all 6 mocks
2. Tell me what to change (aesthetic / layout / data shown)
3. Iterate mocks (cheap)
4. Once approved → port the styles to `src/App.css` + add new tab routing in `src/App.tsx`
5. Ship Phase 1 (Inbox + Reviews tabs) first, defer Insights + Linear
