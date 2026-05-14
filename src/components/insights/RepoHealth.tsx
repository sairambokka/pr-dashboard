import type { RepoStats } from "../../lib/insights";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  stats: RepoStats | undefined;
  mergesPerDay: string;
}

// ── Mini stat sub-component ───────────────────────────────────────────────────

interface StatProps {
  label: string;
  value: string | number | null | undefined;
  danger?: boolean;
  accent?: boolean;
}

function Stat({ label, value, danger, accent }: StatProps) {
  const display = value === null || value === undefined ? "—" : value;
  const color = danger ? "var(--red)" : accent ? "var(--accent)" : "var(--text)";
  return (
    <div>
      <div style={{ fontSize: "24px", color, fontWeight: 300, lineHeight: 1 }}>{display}</div>
      <div
        style={{
          fontSize: "10px",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginTop: "4px",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RepoHealth({ stats, mergesPerDay }: Props) {
  if (!stats) {
    return (
      <div className="card">
        <div className="card-label">REPO HEALTH</div>
        <div style={{ color: "var(--muted)", fontSize: "12px", marginTop: "8px" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-label" style={{ marginBottom: "16px" }}>
        REPO HEALTH
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Stat label="OPEN PRS" value={stats.openCount} />
        <Stat label="STALE > 7D" value={stats.staleCount} danger />
        <Stat
          label="OLDEST OPEN"
          value={stats.oldestOpenDays != null ? `${stats.oldestOpenDays}d` : "—"}
          accent
        />
        <Stat label="MERGES / DAY" value={mergesPerDay} />
      </div>
    </div>
  );
}
