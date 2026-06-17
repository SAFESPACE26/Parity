// UI-only mock ledger. Mirrors the data the Aurora-backed API will eventually
// serve (Parity_Build_Prompt.md §6/§8). The seeded "COBOL Interest & Payroll"
// run reproduces the deterministic one-cent rounding divergence on final_amount.
import { c } from "./tokens";

export type Verdict = "CERTIFIED" | "NOT_CERTIFIED";

// ── Projects dashboard ──────────────────────────────────────────────────────
export type Project = {
  id: string;
  name: string;
  sub: string;
  pipeline: string; // source → target
  verdict: Verdict | null;
  divergence: string;
  lastRun: string;
  runId?: string; // present when a report exists
};

export const projects: Project[] = [
  {
    id: "cobol-interest-payroll",
    name: "COBOL Interest & Payroll",
    sub: "Built-in example · interest_calc, payroll",
    pipeline: "COBOL → Python",
    verdict: "NOT_CERTIFIED",
    divergence: "3.1%",
    lastRun: "2h ago",
    runId: "8f3a2c",
  },
  {
    id: "claims",
    name: "Claims Adjudication",
    sub: "claim_score, eligibility",
    pipeline: "PL/I → Java",
    verdict: "CERTIFIED",
    divergence: "0.0%",
    lastRun: "Yesterday",
  },
  {
    id: "statement",
    name: "Statement Generator",
    sub: "render_stmt, totals",
    pipeline: "COBOL → Python",
    verdict: "CERTIFIED",
    divergence: "0.0%",
    lastRun: "3 days ago",
  },
  {
    id: "tax",
    name: "Tax Withholding",
    sub: "withhold_calc",
    pipeline: "COBOL → Go",
    verdict: null,
    divergence: "—",
    lastRun: "—",
  },
];

// ── Diff cases (final_amount) ───────────────────────────────────────────────
type DivCase = { seq: number; P: string; r: string; t: number; leg: string; mig: string };
type MatchCase = { seq: number; P: string; r: string; t: number; v: string };

export const divCases: DivCase[] = [
  { seq: 1043, P: "3,950.40", r: "3.75", t: 12, leg: "6,145.71", mig: "6,145.70" },
  { seq: 2271, P: "6,240.80", r: "4.20", t: 18, leg: "13,088.45", mig: "13,088.44" },
  { seq: 3508, P: "1,820.00", r: "5.50", t: 9, leg: "2,946.94", mig: "2,946.93" },
  { seq: 4192, P: "9,375.20", r: "3.10", t: 24, leg: "19,506.79", mig: "19,506.78" },
  { seq: 5630, P: "4,500.00", r: "6.00", t: 6, leg: "6,383.27", mig: "6,383.26" },
  { seq: 6745, P: "7,810.40", r: "2.85", t: 30, leg: "18,148.07", mig: "18,148.06" },
  { seq: 7088, P: "2,640.00", r: "4.75", t: 15, leg: "5,295.62", mig: "5,295.61" },
  { seq: 8321, P: "5,125.60", r: "3.95", t: 21, leg: "11,564.23", mig: "11,564.22" },
];

export const matchCases: MatchCase[] = [
  { seq: 1102, P: "3,200.00", r: "4.00", t: 10, v: "4,736.74" },
  { seq: 1408, P: "8,000.00", r: "3.50", t: 20, v: "15,918.40" },
  { seq: 1791, P: "1,500.00", r: "5.00", t: 6, v: "2,010.14" },
  { seq: 2044, P: "12,400.00", r: "2.75", t: 14, v: "18,141.20" },
];

const netPayData = [
  { seq: 1500, gross: "5,750.00", tr: "17.60", net: "4,738.00" },
  { seq: 1501, gross: "8,200.00", tr: "22.50", net: "6,355.00" },
  { seq: 1502, gross: "3,400.00", tr: "15.00", net: "2,890.00" },
  { seq: 1503, gross: "12,000.00", tr: "31.00", net: "8,280.00" },
  { seq: 1504, gross: "6,240.80", tr: "19.40", net: "5,030.08" },
];

export type DiffRow = {
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

// longest common prefix split — emphasizes the diverging characters
function splitDiff(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { pre: a.slice(0, i), diff: a.slice(i) };
}

export function buildRow(c2: DivCase | MatchCase, field: string): DiffRow {
  const leg = "leg" in c2 ? c2.leg : undefined;
  const mig = "mig" in c2 ? c2.mig : undefined;
  const v = "v" in c2 ? c2.v : undefined;
  const diverges = !!(leg && mig && leg !== mig);
  const legV = leg ?? v!;
  const migV = mig ?? v!;
  const ld = splitDiff(legV, migV);
  const md = splitDiff(migV, legV);
  return {
    seq: c2.seq,
    inputs: "$" + c2.P + " · " + c2.r + "% · " + c2.t,
    legacyPre: "$" + ld.pre,
    legacyDiff: ld.diff,
    migPre: "$" + md.pre,
    migDiff: md.diff,
    delta: diverges ? "−$0.01" : "$0.00",
    deltaColor: diverges ? c.divergent : c.muted2,
    glyph: diverges ? "≠" : "=",
    glyphColor: diverges ? c.divergent : c.verified,
    accent: diverges ? c.divergent : "transparent",
    legHl: diverges ? "rgba(22,124,91,.16)" : "transparent",
    legHlC: diverges ? c.verified : "inherit",
    migHl: diverges ? "rgba(179,38,30,.14)" : "transparent",
    migHlC: diverges ? c.divergent : "inherit",
    diverges,
    fullInputs:
      "principal=" +
      c2.P.replace(/,/g, "") +
      "   annual_rate=0.0" +
      c2.r.replace(".", "") +
      "   term_months=" +
      c2.t,
    legacyOut: field + " = " + legV,
    migOut: field + " = " + migV,
  };
}

export function netPayRows(): DiffRow[] {
  return netPayData.map((c2) => ({
    seq: c2.seq,
    inputs: "gross $" + c2.gross + " · tax " + c2.tr + "%",
    legacyPre: "$" + c2.net,
    legacyDiff: "",
    migPre: "$" + c2.net,
    migDiff: "",
    delta: "$0.00",
    deltaColor: c.muted2,
    glyph: "=",
    glyphColor: c.verified,
    accent: "transparent",
    legHl: "transparent",
    legHlC: "inherit",
    migHl: "transparent",
    migHlC: "inherit",
    diverges: false,
    fullInputs:
      "gross=" + c2.gross.replace(/,/g, "") + "   tax_rate=0." + c2.tr.replace(".", ""),
    legacyOut: "net_pay = " + c2.net,
    migOut: "net_pay = " + c2.net,
  }));
}

export const FIELDS = [
  { f: "final_amount", mod: "interest_calc" },
  { f: "net_pay", mod: "payroll" },
] as const;

// Diff rows for the explorer, given the active field + filters.
export function diffRowsFor(field: string, certified: boolean, onlyDiv: boolean): DiffRow[] {
  if (field === "final_amount") {
    const div = certified ? [] : divCases.map((x) => buildRow(x, field));
    if (certified) return onlyDiv ? [] : matchCases.map((x) => buildRow(x, field));
    if (onlyDiv) return div;
    return div
      .concat(matchCases.map((x) => buildRow(x, field)))
      .sort((a, b) => a.seq - b.seq);
  }
  // net_pay matches everywhere
  return onlyDiv ? [] : netPayRows();
}

export const spineRows: DiffRow[] = divCases.slice(0, 3).map((x) => buildRow(x, "final_amount"));

// ── Report meta ─────────────────────────────────────────────────────────────
export function runMeta(certified: boolean) {
  return {
    verdictWord: certified ? "CERTIFIED" : "NOT CERTIFIED",
    verdictColor: certified ? c.verifiedLt : c.divergentLt, // on the ink seal
    verdictColor2: certified ? c.verified : c.divergent, // on paper
    sealMark: certified ? "=" : "≠",
    verdictSummary: certified
      ? "Every field matches the oracle across all 10,000 inputs. The migration behaves identically to the legacy program."
      : "1 field diverges on 312 of 10,000 inputs (3.1%). The migration is not certified.",
    findingCount: certified ? "0" : "1",
    divergingInputs: certified ? "0" : "312",
    evidenceLabel: certified ? "Open evidence" : "Open diff explorer",
    reVerifyHint: certified
      ? "Both runs remain in the ledger."
      : "Re-run after applying the suggested fix.",
  };
}

export function fieldBars(certified: boolean) {
  return FIELDS.map((o) => {
    const rate = o.f === "final_amount" && !certified ? 3.1 : 0;
    return {
      label: o.f,
      rate: rate.toFixed(1) + "%",
      pct: rate > 0 ? Math.max(2, (rate / 3.1) * 72) : 1.5,
      color: rate > 0 ? c.divergent : c.verified,
    };
  });
}

// ── Investigation theater (verifying screen) ─────────────────────────────────
export type TrajStep = {
  k: "agent" | "div" | "match";
  tag?: string;
  at: string;
  text: string;
  detail?: string;
};

export function trajectory(fix: boolean): TrajStep[] {
  if (fix)
    return [
      { k: "agent", tag: "Read", at: "00:00.3", text: "Reading legacy program PARITY-LEGACY — two modules, fixed-decimal arithmetic throughout." },
      { k: "agent", tag: "Map", at: "00:00.9", text: "Mapping the risk surface. interest_calc (compounding loop) and payroll (tax withholding) flagged for monetary rounding." },
      { k: "agent", tag: "Hypothesis", at: "00:01.4", text: "The compounding loop re-rounds every term — a migration could diverge on half-cent ties." },
      { k: "agent", tag: "Probe", at: "00:01.9", text: "Crafting 200 inputs where the annual product lands exactly on a half-cent (…x.xx5)." },
      { k: "match", at: "00:02.4", text: "final_amount matches", detail: "identical at every half-cent tie" },
      { k: "agent", tag: "Narrow", at: "00:02.9", text: "Expanding coverage across the full rate and term ranges." },
      { k: "match", at: "00:03.4", text: "All 200 boundary probes match", detail: "no divergence surfaced" },
      { k: "agent", tag: "Probe", at: "00:03.8", text: "Checking payroll — net_pay across the same inputs." },
      { k: "match", at: "00:04.2", text: "net_pay matches", detail: "identical on every probe" },
      { k: "agent", tag: "Diagnose", at: "00:04.6", text: "No divergence found. The migration now rounds with fixed decimals, matching the oracle exactly." },
    ];
  return [
    { k: "agent", tag: "Read", at: "00:00.3", text: "Reading legacy program PARITY-LEGACY — two modules, fixed-decimal arithmetic throughout." },
    { k: "agent", tag: "Map", at: "00:00.9", text: "Mapping the risk surface. interest_calc (compounding loop) and payroll (tax withholding) flagged high-risk for monetary rounding." },
    { k: "agent", tag: "Hypothesis", at: "00:01.4", text: "The compounding loop multiplies and re-rounds each term — a migration may round half-cents differently than the oracle." },
    { k: "agent", tag: "Probe", at: "00:01.9", text: "Crafting 200 inputs where the annual product lands exactly on a half-cent (…x.xx5)." },
    { k: "div", at: "00:02.4", text: "final_amount diverges", detail: "Δ $0.01 — legacy rounds half away from zero, migrated rounds half to even" },
    { k: "agent", tag: "Narrow", at: "00:02.9", text: "Bisecting the input region to isolate the exact trigger." },
    { k: "div", at: "00:03.4", text: "187 of 200 probes diverge", detail: "every divergence sits on a half-cent tie" },
    { k: "agent", tag: "Probe", at: "00:03.8", text: "Checking payroll — net_pay across the same inputs." },
    { k: "match", at: "00:04.2", text: "net_pay matches", detail: "no divergence in payroll" },
    { k: "agent", tag: "Diagnose", at: "00:04.6", text: "Root cause isolated: float arithmetic with banker’s rounding vs the oracle’s fixed-decimal round-half-away-from-zero." },
  ];
}

export function styleStep(s: TrajStep) {
  const isAgent = s.k === "agent";
  const isDiv = s.k === "div";
  return {
    at: s.at,
    isAgent,
    chip: isAgent ? s.tag! : "Oracle ruling",
    chipBg: isAgent ? "rgba(31,95,122,.1)" : isDiv ? "rgba(179,38,30,.1)" : "rgba(22,124,91,.1)",
    chipColor: isAgent ? c.instrument : isDiv ? c.divergent : c.verified,
    markerColor: isAgent ? c.instrument : isDiv ? c.divergent : c.verified,
    markerRadius: isAgent ? "50%" : "2px",
    text: s.text,
    textColor: isAgent ? c.instrument : isDiv ? c.divergent : c.verified,
    textWeight: isDiv ? 600 : isAgent ? 400 : 500,
    detail: s.detail || "",
    hasDetail: !!s.detail,
  };
}

export const suggestedFix = `from decimal import Decimal, ROUND_HALF_UP

def round_money(value):
    # COBOL ROUNDED rounds half away from zero — match it explicitly.
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)`;
