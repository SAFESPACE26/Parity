"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { c, font } from "@/lib/tokens";
import { FIELDS, diffRowsFor } from "@/lib/mock";

const grid = "70px 1fr 130px 34px 130px 92px";

export default function DiffsPage() {
  return (
    <Suspense fallback={null}>
      <DiffsView />
    </Suspense>
  );
}

function DiffsView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const certified = search.get("certified") === "1";

  const [currentField, setCurrentField] = useState<string>("final_amount");
  const [onlyDiv, setOnlyDiv] = useState(true);
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  const rows = diffRowsFor(currentField, certified, onlyDiv);
  const showEmpty = rows.length === 0;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 32px 80px" }}>
      <Link href={`/runs/${id}?certified=${certified ? 1 : 0}`} style={backLink}>
        ← Run report
      </Link>
      <div style={eyebrow}>Evidence</div>
      <h1 style={title}>Diff explorer</h1>
      <div style={{ fontFamily: font.mono, fontSize: 13, color: c.muted }}>
        run_{id} · drilling from certification to the exact input case
      </div>

      {/* controls */}
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FIELDS.map((o) => {
            const active = o.f === currentField;
            return (
              <button
                key={o.f}
                onClick={() => {
                  setCurrentField(o.f);
                  setExpandedSeq(null);
                }}
                style={{
                  fontFamily: font.mono,
                  fontSize: 12.5,
                  fontWeight: 500,
                  borderRadius: 4,
                  padding: "6px 12px",
                  cursor: "pointer",
                  border: `1px solid ${active ? c.ink : c.rule}`,
                  background: active ? c.ink : c.surface,
                  color: active ? c.paper : c.inkSoft,
                }}
              >
                {o.f}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            setOnlyDiv((v) => !v);
            setExpandedSeq(null);
          }}
          style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", fontFamily: font.sans, fontSize: 13, fontWeight: 500, color: c.inkSoft }}
        >
          <span style={{ width: 34, height: 20, borderRadius: 10, background: onlyDiv ? c.instrument : c.dashBorder, position: "relative", transition: "background .14s ease", display: "inline-block" }}>
            <span style={{ position: "absolute", top: 2, left: onlyDiv ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: c.surface, transition: "left .14s ease", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
          </span>
          Only divergences
        </button>
      </div>

      {/* table */}
      <div style={{ marginTop: 16, background: c.surface, border: `1px solid ${c.rule}`, borderRadius: 6, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,26,42,.06)" }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: 12, padding: "11px 22px", background: c.raised, borderBottom: `1px solid ${c.rule}`, fontWeight: 600, fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted }}>
          <div>Seq</div>
          <div>Inputs</div>
          <div style={{ textAlign: "right" }}>Legacy</div>
          <div style={{ textAlign: "center" }} />
          <div style={{ textAlign: "right" }}>Migrated</div>
          <div style={{ textAlign: "right" }}>Δ</div>
        </div>

        {showEmpty && (
          <div style={{ padding: "54px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: font.mono, fontSize: 15, color: c.verified }}>= No divergences in {currentField}.</div>
            <div style={{ fontSize: 13.5, color: c.muted, marginTop: 7 }}>Every input matched the oracle.</div>
          </div>
        )}

        {rows.map((r) => {
          const expanded = expandedSeq === r.seq;
          return (
            <div key={r.seq}>
              <div
                className="row-hover"
                onClick={() => setExpandedSeq(expanded ? null : r.seq)}
                style={{ display: "grid", gridTemplateColumns: grid, gap: 12, padding: "13px 22px", borderBottom: `1px solid ${c.divider}`, alignItems: "center", cursor: "pointer", borderLeft: `2px solid ${r.accent}` }}
              >
                <div style={{ fontFamily: font.mono, fontSize: 13, color: c.muted }}>{r.seq}</div>
                <div style={{ fontFamily: font.mono, fontSize: 13, color: c.inkSoft }}>{r.inputs}</div>
                <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 14, color: c.ink }}>
                  {r.legacyPre}
                  <span style={{ background: r.legHl, color: r.legHlC, borderRadius: 2, padding: "0 1px" }}>{r.legacyDiff}</span>
                </div>
                <div style={{ textAlign: "center", fontFamily: font.mono, fontSize: 14, color: r.glyphColor }}>{r.glyph}</div>
                <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 14, color: c.ink }}>
                  {r.migPre}
                  <span style={{ background: r.migHl, color: r.migHlC, borderRadius: 2, padding: "0 1px" }}>{r.migDiff}</span>
                </div>
                <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 14, color: r.deltaColor }}>{r.delta}</div>
              </div>
              {expanded && (
                <div style={{ padding: "16px 22px 18px 24px", background: c.raised, borderBottom: `1px solid ${c.divider}`, borderLeft: `2px solid ${r.accent}` }}>
                  <div style={subLabel}>Input set</div>
                  <div style={box()}>{r.fullInputs}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                    <div>
                      <div style={subLabel}>Legacy output (oracle)</div>
                      <div style={box()}>{r.legacyOut}</div>
                    </div>
                    <div>
                      <div style={subLabel}>Migrated output</div>
                      <div style={box()}>{r.migOut}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// helper: monospace evidence box
function box(): React.CSSProperties {
  return {
    fontFamily: font.mono,
    fontSize: 13,
    color: c.inkSoft,
    background: c.surface,
    border: `1px solid ${c.divider}`,
    borderRadius: 4,
    padding: "9px 12px",
    whiteSpace: "pre",
  };
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
  margin: "6px 0 2px",
};
const backLink: React.CSSProperties = {
  fontFamily: font.sans,
  fontSize: 13,
  fontWeight: 500,
  color: c.instrument,
  display: "inline-block",
  marginBottom: 20,
};
const subLabel: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 10.5,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: c.muted,
  marginBottom: 6,
};
