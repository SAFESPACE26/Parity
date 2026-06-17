import Link from "next/link";
import { c, font } from "@/lib/tokens";
import { projects, type Verdict } from "@/lib/mock";

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

export default function Dashboard() {
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

        {projects.map((p, i) => {
          const last = i === projects.length - 1;
          const divColor =
            p.verdict === "NOT_CERTIFIED" ? c.divergent : p.verdict === null ? c.muted2 : c.muted;
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
                cursor: p.runId ? "pointer" : "default",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: c.ink }}>{p.name}</div>
                <div style={{ fontSize: 12.5, color: c.muted, marginTop: 2 }}>{p.sub}</div>
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 13.5, color: c.inkSoft }}>{p.pipeline}</div>
              <div>
                <VerdictPill verdict={p.verdict} />
              </div>
              <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 14, color: divColor }}>
                {p.divergence}
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontFamily: font.mono,
                  fontSize: 13,
                  color: p.verdict === null ? c.muted2 : c.muted,
                }}
              >
                {p.lastRun}
              </div>
            </div>
          );
          return p.runId ? (
            <Link key={p.id} href={`/runs/${p.runId}`}>
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
