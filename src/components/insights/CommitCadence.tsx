import { useMemo } from "react";
import type { CommitWeek } from "../../lib/insights";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayEntry {
  date: Date;
  count: number;
  isWeekend: boolean;
}

interface Props {
  data: CommitWeek[] | undefined;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function flattenLast30Days(weeks: CommitWeek[]): DayEntry[] {
  const flat: DayEntry[] = [];
  for (const week of weeks) {
    for (let d = 0; d < 7; d++) {
      const date = new Date((week.week + d * 86400) * 1000);
      const dow = date.getUTCDay();
      flat.push({
        date,
        count: week.days[d] ?? 0,
        isWeekend: dow === 0 || dow === 6,
      });
    }
  }
  return flat.slice(-30);
}

// ── Component ─────────────────────────────────────────────────────────────────

const SVG_W = 720;
const SVG_H = 120;
const BAR_W = 20;
const BAR_GAP = 4;
const STEP = BAR_W + BAR_GAP; // 24 — 30 bars × 24 = 720

export function CommitCadence({ data }: Props) {
  const days = useMemo(() => flattenLast30Days(data ?? []), [data]);

  const peak = Math.max(1, ...days.map((d) => d.count));
  const totalCommits = days.reduce((s, d) => s + d.count, 0);

  // Peak day of week (Mon..Sun index in 0..6)
  const byDow = Array.from({ length: 7 }, () => 0);
  for (const d of days) {
    byDow[d.date.getUTCDay()] += d.count;
  }
  const peakDow = byDow.indexOf(Math.max(...byDow));
  const peakDay = DAY_NAMES[peakDow] ?? "—";

  return (
    <div className="card">
      <div className="card-label" style={{ marginBottom: "16px" }}>
        COMMIT CADENCE · LAST 30D
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: SVG_H }}
      >
        <g fill="var(--yellow)">
          {days.map((day, i) => {
            const barH = (day.count / peak) * SVG_H;
            const x = i * STEP;
            const y = SVG_H - barH;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={BAR_W}
                height={barH}
                opacity={day.isWeekend ? 0.4 : 1}
              />
            );
          })}
        </g>
        <line x1="0" y1={SVG_H} x2={SVG_W} y2={SVG_H} stroke="var(--border)" strokeWidth="1" />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10px",
          color: "var(--muted)",
          marginTop: "8px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <span>30D AGO</span>
        <span>
          {totalCommits} COMMITS · PEAK {peakDay}
        </span>
        <span>TODAY</span>
      </div>
    </div>
  );
}
