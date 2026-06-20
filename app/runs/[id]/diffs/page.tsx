"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { c, font } from "@/lib/tokens";

const FIELDS = ["final_amount", "net_pay"] as const;
const grid = "70px 1fr 130px 34px 130px 92px";

type InputObj = Record<string, string | number>;

type DiffApiRow = {
  id: string;
  field_name: string;
  legacy_value: string;
  migrated_value: string;
  is_match: boolean;
  delta: string | null;
  seq: number;
  inputs: InputObj;
};

type DisplayRow = {
  seq: number;
  inputs: string;
  legacyPre: string;
  legacyDiff: string;
  migPre: string;
  migDiff: string;
  delta: string;
  deltaColor: string;
  glyph: string;
  glyphColor: string;
  accent: string;
  legHl: string;
  legHlC: string;
  migHl: string;
  migHlC: string;
  diverges: boolean;
  fullInputs: string;
  legacyOut: string;
  migOut: string;
};

function fmtMoney(v: string): string {
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function splitDiff(a: string, b: string): { pre: string; diff: string } {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { pre: a.slice(0, i), diff: a.slice(i) };
}

function fmtInputsShort(inputs: InputObj, field: string): string {
  if (field === "net_pay") {
    const gross = fmtMoney(String(inputs.gross));
    const tax = (parseFloat(String(inputs.tax_rate)) * 100).toFixed(2);
    return `gross $${gross} · tax ${tax}%`;
  }
  const principal = fmtMoney(String(inputs.principal));
  const rate = (parseFloat(String(inputs.rate)) * 100).toFixed(2);
  return `$${principal} · ${rate}% · ${inputs.term}`;
}

function fmtInputsFull(inputs: InputObj): string {
  return Object.entries(inputs)
    .map(([k, v]) => `${k}=${v}`)
    .join("   ");
}

function buildDisplayRow(r: DiffApiRow): DisplayRow {
  const legFmt = "$" + fmtMoney(r.legacy_value);
  const migFmt = "$" + fmtMoney(r.migrated_value);
  const ld = splitDiff(legFmt, migFmt);
  const md = splitDiff(migFmt, legFmt);
  const diverges = !r.is_match;
  const absDelta = r.delta ? Math.abs(parseFloat(r.delta)) : 0;
  return {
    seq: r.seq,
    inputs: fmtInputsShort(r.inputs, r.field_name),
    legacyPre: ld.pre,
    legacyDiff: ld.diff,
    migPre: md.pre,
    migDiff: md.diff,
    delta: absDelta > 0 ? `$${absDelta.toFixed(2)}` : "$0.00",
    deltaColor: diverges ? c.divergent : c.muted2,
    glyph: diverges ? "≠" : "=",
    glyphColor: diverges ? c.divergent : c.verified,
    accent: diverges ? c.divergent : "transparent",
    legHl: diverges ? "rgba(22,124,91,.16)" : "transparent",
    legHlC: diverges ? c.verified : "inherit",
    migHl: diverges ? "rgba(179,38,30,.14)" : "transparent",
    migHlC: diverges ? c.divergent : "inherit",
    diverges,
    fullInputs: fmtInputsFull(r.inputs),
    legacyOut: `${r.field_name} = ${fmtMoney(r.legacy_value)}`,
    migOut: `${r.field_name} = ${fmtMoney(r.migrated_value)}`,
  };
}

export default function DiffsPage() {
  return (
    <Suspense fallback={null}>
      <DiffsView />
    </Suspense>
  );
}

function DiffsView() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [currentField, setCurrentField] = useState<string>("final_amount");
  const [onlyDiv, setOnlyDiv] = useState(true);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setExpandedSeq(null);
    const qs = new URLSearchParams({
      field: currentField,
      onlyMismatches: String(onlyDiv),
      limit: "50",
      offset: "0",
    });
    fetch(`/api/runs/${id}/diffs?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        setRows((data.rows ?? []).map(buildDisplayRow));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, currentField, onlyDiv]);

  const showEmpty = !loading && rows.length === 0;

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 32px 80px" }}>
      <Link href={`/runs/${id}`} style={backLink}>
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
          {FIELDS.map((f) => {
            const active = f === currentField;
            return (
              <button
                key={f}
                onClick={() => setCurrentField(f)}
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
                {f}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setOnlyDiv((v) => !v)}
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

        {loading && (
          <div style={{ padding: "40px 24px", textAlign: "center", fontFamily: font.mono, fontSize: 13, color: c.muted2 }}>
            Loading…
          </div>
        )}

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
