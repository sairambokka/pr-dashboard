import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { fetchActivity, type ActivityEvent, type ActivityFeed } from "../lib/activity";

interface Props {
  token: string;
  owner: string;
  repo: string;
  hideBots: boolean;
  intervalMs: number;
}

// ── Cadence bucketing ──────────────────────────────────────────────────────

interface CadenceBucket {
  date: string;
  opened: number;
  merged: number;
  closed: number;
  total: number;
}

interface CadenceTotals {
  opened: number;
  merged: number;
  closed: number;
  total: number;
}

function computeCadence(events: ActivityEvent[]): {
  buckets: CadenceBucket[];
  totals: CadenceTotals;
} {
  const now = Date.now();
  const dayMs = 86_400_000;
  const buckets: CadenceBucket[] = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(now - (6 - i) * dayMs);
    dayStart.setHours(0, 0, 0, 0);
    return { date: dayStart.toISOString().slice(0, 10), opened: 0, merged: 0, closed: 0, total: 0 };
  });

  for (const e of events) {
    const t = new Date(e.timestamp).getTime();
    const daysAgo = Math.floor((now - t) / dayMs);
    if (daysAgo >= 7 || daysAgo < 0) continue;
    const b = buckets[6 - daysAgo];
    b[e.kind]++;
    b.total++;
  }

  const totals = buckets.reduce(
    (a, b) => ({
      opened: a.opened + b.opened,
      merged: a.merged + b.merged,
      closed: a.closed + b.closed,
      total: a.total + b.total,
    }),
    { opened: 0, merged: 0, closed: 0, total: 0 },
  );

  return { buckets, totals };
}

// ── Cadence sparkline component ────────────────────────────────────────────

function CadencePanel({ events }: { events: ActivityEvent[] }) {
  const { buckets, totals } = useMemo(() => computeCadence(events), [events]);

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const barWidth = 92;
  const gap = 8; // (700 - 7*92) / 6 = ~8
  const maxHeight = 58;
  const viewHeight = 64;

  const cadenceLabel = `${totals.opened} / ${totals.total} / ${totals.closed}`;

  return (
    <div className="cadence">
      <div className="cadence-label">
        7D CADENCE <strong>{cadenceLabel}</strong>
      </div>

      <svg
        className="cadence-spark"
        viewBox="0 0 700 64"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cadence-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffb700" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffb700" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gradient fill bars */}
        <g>
          {buckets.map((b, i) => {
            const barH = b.total > 0 ? Math.max(2, (b.total / maxTotal) * maxHeight) : 0;
            const x = i * (barWidth + gap);
            const y = viewHeight - barH;
            return (
              <rect
                key={b.date}
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill="url(#cadence-grad)"
              />
            );
          })}
        </g>

        {/* Bar top lines */}
        <g stroke="#ffb700" strokeWidth="2" fill="none">
          {buckets.map((b, i) => {
            if (b.total === 0) return null;
            const barH = Math.max(2, (b.total / maxTotal) * maxHeight);
            const x = i * (barWidth + gap);
            const y = viewHeight - barH;
            return (
              <line key={b.date} x1={x} y1={y} x2={x + barWidth} y2={y} />
            );
          })}
        </g>

        {/* Baseline */}
        <line x1="0" y1="64" x2="700" y2="64" stroke="#2a2a2a" />
      </svg>

      <div className="cadence-stats">
        <div className="cs-block">
          OPENED <strong>{totals.opened}</strong>
        </div>
        <div className="cs-block">
          MERGED <strong>{totals.merged}</strong>
        </div>
        <div className="cs-block">
          CLOSED <strong>{totals.closed}</strong>
        </div>
      </div>
    </div>
  );
}

// ── Day grouping ───────────────────────────────────────────────────────────

function formatShortDay(d: Date): string {
  return d
    .toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();
}

function groupByDay(events: ActivityEvent[]): Array<{ label: string; count: number; events: ActivityEvent[] }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000);

  const map = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const d = new Date(e.timestamp);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, dayEvents]) => {
      const d = new Date(key + "T00:00:00");
      const label =
        d.getTime() === today.getTime()
          ? `TODAY · ${formatShortDay(d)}`
          : d.getTime() === yesterday.getTime()
            ? `YESTERDAY · ${formatShortDay(d)}`
            : formatShortDay(d);
      return {
        label,
        count: dayEvents.length,
        events: dayEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      };
    });
}

// ── Activity row helpers ───────────────────────────────────────────────────

function formatHHmm(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function iconChar(kind: ActivityEvent["kind"]): string {
  return kind === "merged" ? "◆" : "◇";
}

function verb(kind: ActivityEvent["kind"]): string {
  return kind;
}

// ── Main component ─────────────────────────────────────────────────────────

export function ActivityPanel({ token, owner, repo, hideBots, intervalMs }: Props) {
  const etagRef = useRef<string | null>(null);
  const cachedFeedRef = useRef<ActivityFeed | null>(null);

  const { data, isFetching, error } = useQuery({
    queryKey: ["activity", owner, repo, hideBots],
    queryFn: async () => {
      const feed = await fetchActivity(token, owner, repo, {
        etag: etagRef.current ?? undefined,
        hideBots,
      });
      // 304: empty events array signals "not modified" — keep cached feed
      if (feed.events.length === 0 && etagRef.current && cachedFeedRef.current) {
        return cachedFeedRef.current;
      }
      etagRef.current = feed.etag;
      cachedFeedRef.current = feed;
      return feed;
    },
    refetchInterval: intervalMs,
    enabled: Boolean(token && owner && repo),
  });

  const events = data?.events ?? [];
  const dayGroups = useMemo(() => groupByDay(events), [events]);
  const totalEvents = events.length;

  // Loading state (no cached data yet)
  if (!data && isFetching) {
    return <div className="empty">Loading activity...</div>;
  }

  // Error state
  if (error && !data) {
    return <div className="error">Activity feed unavailable — retry</div>;
  }

  return (
    <>
      <div className="section-head">
        <div className="section-title">REPO ACTIVITY // LAST 7 DAYS</div>
        <div className="section-meta">
          {totalEvents} EVENTS · {owner.toUpperCase()}/{repo.toUpperCase()}
        </div>
      </div>

      <CadencePanel events={events} />

      {totalEvents === 0 ? (
        <div className="empty">No activity in last 7 days</div>
      ) : (
        dayGroups.map((group) => (
          <div key={group.label} className="day-block">
            <div className="day-header">
              <span className="day-name">{group.label}</span>
              <span />
              <span className="day-meta">{group.count} EVENTS</span>
            </div>

            {group.events.map((event) => (
              <a
                key={event.id}
                href={event.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="row activity-row"
              >
                <span className="ar-ts mono">{formatHHmm(event.timestamp)}</span>
                <span className={`ar-icon icon-${event.kind}`}>{iconChar(event.kind)}</span>
                <span className="ar-summary">
                  <span className="actor">{event.actor}</span> {verb(event.kind)}{" "}
                  <span className="pr-ref">{event.prNumber}</span>{" "}
                  <span className="title">{event.prTitle}</span>
                </span>
                <span className="ar-kind">{event.kind.toUpperCase()}</span>
              </a>
            ))}
          </div>
        ))
      )}
    </>
  );
}
