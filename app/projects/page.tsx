import Link from "next/link";
import { c, font } from "@/lib/tokens";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";

type Verdict = "CERTIFIED" | "NOT_CERTIFIED";

const grid = "1.6fr 1.2fr 1fr 0.9fr 0.9fr";

function VerdictPill({ verdict }: { verdict: Verdict | null }) {
  if (verdict === null)
    return <span style={pill(c.muted, c.rule, "transparent")}>— Never run</span>;
  if (verdict === "CERTIFIED")
    return <span style={pill(c.verified, "rgba(22,124,91,.4)", "rgba(22,124,91,.05)")}>= VERIFIED</span>;
  return <span style={pill(c.divergent, "rgba(179,38,30,.4)", "rgba(179,38,30,.05)")}>≠ NOT CERTIFIED</span>;
}

function pill(fg: string, bd: string, bg: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: font.mono,
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: ".04em",
    color: fg,
    border: `1px solid ${bd}`,
    background: bg,
    borderRadius: 4,
    padding: "3px 9px",
    whiteSpace: "nowrap",
  };
}

function formatDivergence(rate: string | null): string {
  if (!rate) return "—";
  const pct = parseFloat(rate) * 100;
  return isNaN(pct) ? "—" : pct.toFixed(1) + "%";
}

function formatRelTime(ts: string | null): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function Dashboard() {
  const rows = await sql`
    SELECT p.id, p.name, p.source_language, p.target_language,
      r.id AS run_id, r.verdict, r.completed_at,
      (SELECT ROUND(MAX(divergence_rate)::numeric, 4) FROM findings WHERE run_id = r.id) AS max_divergence_rate
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT id, verdict, completed_at
      FROM verification_runs
      WHERE project_id = p.id
      ORDER BY created_at DESC
      LIMIT 1
    ) r ON true
    ORDER BY p.created_at DESC
  `;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "44px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
        <div>
          <div style={eyebrow}>Projects</div>
          <h1 style={title}>Verification ledger</h1>
        </div>
        <Link href="/verify/new" className="btn-dark" style={primaryBtn}>
          New verification
        </Link>
      </div>

      <div
        style={{
          marginTop: 28,
          background: c.surface,
          border: `1px solid ${c.rule}`,
          borderRadius: 6,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(15,26,42,.06)",
        }}
      >
        <div style={{ ...headerRow, gridTemplateColumns: grid }}>
          <div>Project</div>
          <div>Source → target</div>
          <div>Latest verdict</div>
          <div style={{ textAlign: "right" }}>Divergence</div>
          <div style={{ textAlign: "right" }}>Last run</div>
        </div>

        {rows.length === 0 && (
          <div style={{ padding: "54px 24px", textAlign: "center", fontFamily: font.mono, fontSize: 14, color: c.muted }}>
            No projects yet. <Link href="/verify/new" style={{ color: c.instrument }}>Start a verification →</Link>
          </div>
        )}

        {rows.map((p, i) => {
          const last = i === rows.length - 1;
          const verdict = p.verdict as Verdict | null;
          const divColor = verdict === "NOT_CERTIFIED" ? c.divergent : verdict === null ? c.muted2 : c.muted;
          const pipeline = `${p.source_language} → ${p.target_language}`;
          const inner = (
            <div
              className="row-hover"
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                gap: 16,
                padding: "18px 22px",
                borderBottom: last ? "none" : `1px solid ${c.divider}`,
                alignItems: "center",
                cursor: p.run_id ? "pointer" : "default",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: c.ink }}>{p.name}</div>
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 13.5, color: c.inkSoft }}>{pipeline}</div>
              <div>
                <VerdictPill verdict={verdict} />
              </div>
              <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 14, color: divColor }}>
                {formatDivergence(p.max_divergence_rate)}
              </div>
              <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 13, color: verdict === null ? c.muted2 : c.muted }}>
                {formatRelTime(p.completed_at)}
              </div>
            </div>
          );
          return p.run_id ? (
            <Link key={p.id} href={`/runs/${p.run_id}`}>
              {inner}
            </Link>
          ) : (
            <div key={p.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  lineHeight: "16px",
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: c.muted,
};
const title: React.CSSProperties = {
  fontFamily: font.serif,
  fontWeight: 500,
  fontSize: 28,
  lineHeight: "34px",
  color: c.ink,
  margin: "6px 0 0",
};
const primaryBtn: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 600,
  fontSize: 14,
  color: c.paper,
  background: c.ink,
  border: `1px solid ${c.ink}`,
  borderRadius: 6,
  padding: "11px 18px",
  cursor: "pointer",
};
const headerRow: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: "13px 22px",
  borderBottom: `1px solid ${c.rule}`,
  background: c.raised,
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: c.muted,
};
