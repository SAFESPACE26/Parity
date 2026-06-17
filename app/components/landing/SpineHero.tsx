"use client";

import { c, font } from "@/lib/tokens";
import { useCountUp, useInView, useLoop, useReducedMotion } from "./anim";

type Row = {
  legPre: string;
  legDiff: string;
  migPre: string;
  migDiff: string;
  input: string;
  diverge: boolean;
  delta?: string;
};

// The equivalence spine: aligned LEGACY / MIGRATED values with a center spine
// that breaks on divergence. (DESIGN.md §4 — the signature motif.)
const ROWS: Row[] = [
  { legPre: "$4,736.74", legDiff: "", migPre: "$4,736.74", migDiff: "", input: "$3,200.00 · 4.00% · 10", diverge: false },
  { legPre: "$15,918.40", legDiff: "", migPre: "$15,918.40", migDiff: "", input: "$8,000.00 · 3.50% · 20", diverge: false },
  { legPre: "$6,145.7", legDiff: "1", migPre: "$6,145.7", migDiff: "0", input: "$3,950.40 · 3.75% · 12", diverge: true, delta: "−$0.01" },
  { legPre: "$2,010.14", legDiff: "", migPre: "$2,010.14", migDiff: "", input: "$1,500.00 · 5.00% · 6", diverge: false },
  { legPre: "$18,141.20", legDiff: "", migPre: "$18,141.20", migDiff: "", input: "$12,400.00 · 2.75% · 14", diverge: false },
];

const REVEAL_AT = ROWS.map((_, i) => 0.12 + i * 0.15); // sequential reveal, all in by ~0.72

export default function SpineHero() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const t = useLoop(inView, 4200);
  const matched = useCountUp(9997, inView, 1600);
  const diverged = useCountUp(3, inView, 1600);

  const frontier = Math.min(1, t / 0.72); // scanline progress over the rows

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <div style={card}>
        {/* header */}
        <div style={head}>
          <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: c.sealMuted }}>
            Legacy (oracle)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: font.mono, fontSize: 11, color: c.accentLt }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.accentLt, animation: reduce ? "none" : "paPulse 1.1s ease-in-out infinite" }} />
            comparing
          </span>
          <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: c.sealMuted, textAlign: "right" }}>
            Migrated
          </span>
        </div>

        {/* rows + scanline */}
        <div style={{ position: "relative", padding: "6px 0" }}>
          {!reduce && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 18,
                right: 18,
                top: `calc(${frontier * 100}% )`,
                height: 1,
                background: `linear-gradient(90deg, transparent, ${c.instrument}, transparent)`,
                boxShadow: `0 0 8px ${c.instrument}`,
                opacity: frontier > 0.005 && frontier < 0.999 ? 0.9 : 0,
                transition: "opacity .2s",
                pointerEvents: "none",
              }}
            />
          )}
          {ROWS.map((r, i) => {
            const revealed = reduce || t >= REVEAL_AT[i];
            return <SpineRow key={i} r={r} revealed={revealed} reduce={reduce} />;
          })}
        </div>

        {/* tally footer */}
        <div style={footer}>
          <Tally label="matched" value={Math.round(matched).toLocaleString("en-US")} color={c.verified} glyph="=" />
          <div style={{ width: 1, alignSelf: "stretch", background: c.sealRule }} />
          <Tally label="diverged" value={Math.round(diverged).toLocaleString("en-US")} color={c.divergentLt} glyph="≠" />
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.sealMuted, letterSpacing: ".04em" }}>
            10,000 inputs · field-level
          </span>
        </div>
      </div>
    </div>
  );
}

function SpineRow({ r, revealed, reduce }: { r: Row; revealed: boolean; reduce: boolean }) {
  const glyph = !revealed ? "·" : r.diverge ? "≠" : "=";
  const glyphColor = !revealed ? c.sealMuted : r.diverge ? c.divergentLt : c.verified;
  return (
    <div
      style={{
        padding: "10px 18px",
        opacity: revealed ? 1 : 0.34,
        transition: reduce ? "none" : "opacity .35s ease, transform .35s ease",
        transform: revealed ? "translateY(0)" : "translateY(2px)",
        borderTop: `1px solid ${c.sealRule}`,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 34px 1fr", alignItems: "center" }}>
        <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 16, color: revealed ? c.paper : c.sealMuted }}>
          {r.legPre}
          {r.diverge && revealed && (
            <span style={{ background: "rgba(47,162,119,.22)", color: "#7BD4AC", borderRadius: 2, padding: "0 2px" }}>{r.legDiff}</span>
          )}
        </div>
        <div
          style={{
            textAlign: "center",
            fontFamily: font.mono,
            fontSize: 15,
            color: glyphColor,
            fontWeight: r.diverge ? 600 : 400,
            transition: reduce ? "none" : "color .25s",
          }}
        >
          {glyph}
        </div>
        <div style={{ textAlign: "left", fontFamily: font.mono, fontSize: 16, color: revealed ? c.paper : c.sealMuted }}>
          {r.migPre}
          {r.diverge && revealed && (
            <span style={{ background: "rgba(221,90,80,.22)", color: "#F0A199", borderRadius: 2, padding: "0 2px" }}>{r.migDiff}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
        <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.sealMuted }}>{r.input}</span>
        {r.diverge && revealed && (
          <span style={{ fontFamily: font.mono, fontSize: 10.5, color: c.divergentLt, border: `1px solid rgba(221,90,80,.4)`, borderRadius: 3, padding: "1px 6px" }}>
            Δ {r.delta}
          </span>
        )}
      </div>
    </div>
  );
}

function Tally({ label, value, color, glyph }: { label: string; value: string; color: string; glyph: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: font.mono, fontSize: 13, color, width: 12 }}>{glyph}</span>
      <span style={{ fontFamily: font.mono, fontSize: 16, color: c.paper }}>{value}</span>
      <span style={{ fontSize: 11, color: c.sealMuted, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</span>
    </div>
  );
}

const card: React.CSSProperties = {
  background: c.ink,
  borderRadius: 10,
  boxShadow: "0 18px 48px rgba(15,26,42,.28)",
  border: `1px solid ${c.sealRule}`,
  overflow: "hidden",
};
const head: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: `1px solid ${c.sealRule}`,
  background: "rgba(255,255,255,.02)",
};
const footer: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "13px 18px",
  borderTop: `1px solid ${c.sealRule}`,
  background: "rgba(255,255,255,.02)",
};
