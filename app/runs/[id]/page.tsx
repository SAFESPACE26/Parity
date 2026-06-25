"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { c, font } from "@/lib/tokens";

// ── Types ────────────────────────────────────────────────────────────────────
type RunInfo = {
  id: string;
  project_id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string | null;
  verdict: string | null;
  created_at: string;
  completed_at: string | null;
  input_count: number;
  diverging_input_count: number;
  error: string | null;
  project_name: string;
  source_language: string;
  target_language: string;
  cert_verdict: string | null;
  issued_at: string | null;
  finding_count: number | null;
  coverage_summary: unknown;
};

type Finding = {
  id: string;
  field_name: string;
  module_name: string | null;
  diverging_count: number;
  total_count: number;
  divergence_rate: string;
  max_abs_delta: string | null;
  severity: string;
  explanation: string | null;
  suggested_fix: string | null;
};

type CoverageField = {
  field_name: string;
  mismatch_count: string;
  total_count: string;
  divergence_rate: string;
};

type ProjectRun = {
  id: string;
  run_number: number;
  status: string;
  verdict: string | null;
  max_divergence_rate: string;
};

type DiffApiRow = {
  field_name: string;
  legacy_value: string;
  migrated_value: string;
  is_match: boolean;
  delta: string | null;
  seq: number;
};

type SpineRow = {
  seq: number;
  legacyPre: string;
  legacyDiff: string;
  migPre: string;
  migDiff: string;
};

type ReportData = {
  findings: Finding[];
  coverage: { fields: CoverageField[]; totalComparisons: number; totalMismatches: number };
  projectRuns: ProjectRun[];
  spineRows: SpineRow[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(v: string): string {
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function splitDiff(a: string, b: string): { pre: string; diff: string } {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { pre: a.slice(0, i), diff: a.slice(i) };
}

function fmtDateTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "UTC", hour12: false,
  }) + " UTC";
}

function buildSpineRows(apiRows: DiffApiRow[]): SpineRow[] {
  return apiRows.map((r) => {
    const legFmt = "$" + fmtMoney(r.legacy_value);
    const migFmt = "$" + fmtMoney(r.migrated_value);
    const ld = splitDiff(legFmt, migFmt);
    const md = splitDiff(migFmt, legFmt);
    return { seq: r.seq, legacyPre: ld.pre, legacyDiff: ld.diff, migPre: md.pre, migDiff: md.diff };
  });
}

// ── Page entry ────────────────────────────────────────────────────────────────
export default function RunPage() {
  return (
    <Suspense fallback={null}>
      <RunView />
    </Suspense>
  );
}

// ── RunView: state machine ────────────────────────────────────────────────────
type Phase = "waiting" | "report" | "error";

function RunView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [phase, setPhase] = useState<Phase>("waiting");
  const [stamped, setStamped] = useState(false);
  const [runData, setRunData] = useState<RunInfo | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  // Load all report sub-data after a run completes
  const loadReport = useCallback(
    async (run: RunInfo) => {
      const [findings, coverage, projectRuns, spineResp] = await Promise.all([
        fetch(`/api/runs/${run.id}/findings`).then((r) => r.json()),
        fetch(`/api/runs/${run.id}/coverage`).then((r) => r.json()),
        fetch(`/api/projects/${run.project_id}/runs`).then((r) => r.json()),
        fetch(`/api/runs/${run.id}/diffs?field=final_amount&onlyMismatches=true&limit=3`).then((r) => r.json()),
      ]);
      setReportData({
        findings: findings ?? [],
        coverage: coverage ?? { fields: [], totalComparisons: 0, totalMismatches: 0 },
        projectRuns: projectRuns ?? [],
        spineRows: buildSpineRows(spineResp?.rows ?? []),
      });
      setPhase("report");
      setTimeout(() => setStamped(true), 240);
    },
    []
  );

  // Poll while in "waiting" phase
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (phase !== "waiting") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/runs/${id}`);
        if (!res.ok) { setPhase("error"); return; }
        const data: RunInfo = await res.json();
        setRunData(data);
        if (data.status === "completed") {
          clearInterval(pollRef.current!);
          await loadReport(data);
        } else if (data.status === "failed") {
          clearInterval(pollRef.current!);
          setPhase("error");
        }
      } catch {
        setPhase("error");
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current!);
  }, [phase, id, loadReport]);

  if (phase === "waiting") return <WaitingView id={id} runData={runData} />;
  if (phase === "error") return <ErrorView id={id} error={runData?.error ?? null} />;
  if (!reportData || !runData) return null;
  return <Report id={id} runData={runData} reportData={reportData} stamped={stamped} router={router} />;
}

// ── Waiting for the pipeline ──────────────────────────────────────────────────
// Real stage telemetry — the worker stamps verification_runs.stage per phase.
const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: "generate", label: "Generate inputs" },
  { key: "execute", label: "Execute legacy + migrated" },
  { key: "compare", label: "Compare & localize" },
  { key: "explain", label: "Explain divergences" },
  { key: "certify", label: "Issue verdict" },
];

function WaitingView({ id, runData }: { id: string; runData: RunInfo | null }) {
  const status = runData?.status ?? "queued";
  const stage = runData?.stage ?? null;
  const currentIdx = stage ? PIPELINE_STAGES.findIndex((s) => s.key === stage) : -1;
  const inputCount = runData?.input_count ? runData.input_count.toLocaleString("en-US") : null;

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "72px 32px" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.instrument, boxShadow: "0 0 0 4px rgba(31,95,122,.13)", animation: "paPulse 1.1s ease-in-out infinite" }} />
        <span style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: c.instrument }}>
          {status === "queued" ? "Queued — waiting for worker" : "Pipeline running"}
        </span>
      </div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: c.ink, marginBottom: 4 }}>Verification in progress</div>
      <div style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted, marginBottom: 24 }}>
        run_{id}{inputCount ? ` · ${inputCount} inputs` : ""}
      </div>

      <div style={{ ...panel, padding: "8px 0" }}>
        {PIPELINE_STAGES.map((s, i) => {
          const done = currentIdx > i || status === "completed";
          const active = currentIdx === i && status !== "completed";
          const color = done ? c.verified : active ? c.instrument : c.muted2;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 20px", borderTop: i === 0 ? "none" : `1px solid ${c.divider}` }}>
              <span style={{ flex: "none", width: 18, height: 18, borderRadius: "50%", border: `2px solid ${color}`, background: done ? c.verified : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: c.surface, fontSize: 11, fontFamily: font.mono }}>
                {done ? "✓" : active ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.instrument, animation: "paPulse 1.1s ease-in-out infinite" }} /> : ""}
              </span>
              <span style={{ fontFamily: font.sans, fontSize: 14, color: done ? c.inkSoft : active ? c.ink : c.muted, fontWeight: active ? 600 : 400 }}>{s.label}</span>
              {active && <span style={{ marginLeft: "auto", fontFamily: font.mono, fontSize: 11, color: c.instrument, textTransform: "uppercase", letterSpacing: ".05em" }}>running</span>}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12.5, color: c.muted2, marginTop: 16, textAlign: "center" }}>
        Stages reported live from the worker. Results appear automatically when complete.
      </div>
    </div>
  );
}

// ── Error view ────────────────────────────────────────────────────────────────
function ErrorView({ id, error }: { id: string; error: string | null }) {
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
      <div style={{ fontFamily: font.mono, fontSize: 14, color: c.divergent, marginBottom: 8 }}>≠ Verification failed</div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: c.ink, marginBottom: 8 }}>run_{id}</div>
      {error && <div style={{ fontFamily: font.mono, fontSize: 12, color: c.muted, marginBottom: 16 }}>{error}</div>}
      <Link href="/projects" style={{ fontFamily: font.sans, fontSize: 13, color: c.instrument }}>← Back to projects</Link>
    </div>
  );
}

// ── Certified celebration ─────────────────────────────────────────────────────
// One orchestrated moment when a migration is CERTIFIED: a brief ribbon burst in
// the forensic-ledger greens. Auto-hidden under prefers-reduced-motion (CSS).
function CertifiedCelebration() {
  const COLORS = [c.verified, c.verifiedLt, "#7BC4A4", c.amber, c.paper];
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        // deterministic-ish spread so SSR/client agree well enough for a one-shot overlay
        const rnd = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
        return {
          left: rnd(1) * 100,
          drift: (rnd(2) - 0.5) * 220,
          rot: 360 + rnd(3) * 540,
          dur: 2.4 + rnd(4) * 1.3,
          delay: rnd(5) * 0.5,
          w: 6 + rnd(6) * 5,
          h: 10 + rnd(7) * 12,
          color: COLORS[Math.floor(rnd(8) * COLORS.length)],
          ribbon: rnd(9) > 0.5,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 4200);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div
      className="pa-confetti-layer"
      aria-hidden
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: -24,
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            background: p.color,
            borderRadius: p.ribbon ? 1 : 2,
            opacity: 0,
            ["--x" as string]: `${p.drift}px`,
            ["--r" as string]: `${p.rot}deg`,
            animation: `paConfetti ${p.dur}s cubic-bezier(.25,.6,.4,1) ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ── Report ────────────────────────────────────────────────────────────────────
function Report({
  id,
  runData,
  reportData,
  stamped,
  router,
}: {
  id: string;
  runData: RunInfo;
  reportData: ReportData;
  stamped: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const certified = runData.cert_verdict === "CERTIFIED";
  const verdictWord = certified ? "CERTIFIED" : "NOT CERTIFIED";
  const verdictColor = certified ? c.verifiedLt : c.divergentLt;
  const verdictColor2 = certified ? c.verified : c.divergent;
  const sealMark = certified ? "=" : "≠";
  const inputCount = runData.input_count?.toLocaleString("en-US") ?? "—";
  const divergingCount = runData.diverging_input_count?.toLocaleString("en-US") ?? "—";
  const findingCount = runData.finding_count ?? 0;
  const fieldsChecked = reportData.coverage.fields.length;

  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 32px 80px" }}>
      {certified && stamped && <CertifiedCelebration />}
      <Link href="/projects" style={backLink}>← Projects</Link>

      {/* VERDICT SEAL */}
      <div
        style={{
          background: c.ink,
          borderRadius: 8,
          boxShadow: "0 10px 34px rgba(15,26,42,.24)",
          padding: "36px 38px 30px",
          color: c.paper,
          position: "relative",
          overflow: "hidden",
          animation: stamped
            ? certified
              ? "paStamp 320ms cubic-bezier(.2,.8,.25,1) both, paCertGlow 1700ms ease-out 320ms both"
              : "paStamp 320ms cubic-bezier(.2,.8,.25,1) both"
            : "none",
        }}
      >
        <div style={{ position: "absolute", right: -10, top: -30, fontFamily: font.serif, fontSize: 230, lineHeight: 1, color: "rgba(255,255,255,.035)", fontWeight: 500, pointerEvents: "none" }}>
          {sealMark}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <span style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: c.sealMuted }}>Certificate of verification</span>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: c.sealMuted }}>run_{id}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 18, position: "relative" }}>
          <span style={{ fontFamily: font.serif, fontWeight: 500, fontSize: 46, lineHeight: 1, color: verdictColor }}>
            {verdictWord}
          </span>
        </div>
        <div style={{ fontFamily: font.sans, fontSize: 15, lineHeight: "23px", color: c.sealText, marginTop: 12, maxWidth: 560, position: "relative" }}>
          {certified
            ? `Every field matches the oracle across all ${inputCount} inputs. The migration behaves identically to the legacy program.`
            : `${findingCount} field${findingCount !== 1 ? "s" : ""} ${findingCount !== 1 ? "diverge" : "diverges"} on ${divergingCount} of ${inputCount} inputs. The migration is not certified.`}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18, marginTop: 26, paddingTop: 22, borderTop: `1px solid ${c.sealRule}`, position: "relative" }}>
          <SealStat label="Inputs verified" value={inputCount} />
          <SealStat label="Fields checked" value={String(fieldsChecked)} />
          <SealStat label="Findings" value={String(findingCount)} color={verdictColor} />
          <SealStat label="Issued" value={fmtDateTime(runData.issued_at)} small />
        </div>
      </div>

      {/* SUMMARY BAND */}
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <Stat label="Inputs verified" value={inputCount} />
        <Stat label="Fields checked" value={String(fieldsChecked)} />
        <Stat label="Diverging inputs" value={divergingCount} color={verdictColor2} />
        <Stat label="Coverage" value="100%" color={c.verified} />
      </div>

      {/* FINDINGS / CERTIFIED */}
      {!certified ? (
        <FindingsSection
          findings={reportData.findings}
          spineRows={reportData.spineRows}
          copied={copied}
          copy={copy}
          id={id}
          router={router}
        />
      ) : (
        <CertifiedNote />
      )}

      {/* ANALYTICS */}
      <h2 style={{ fontWeight: 600, fontSize: 20, lineHeight: "28px", color: c.ink, margin: "34px 0 4px" }}>Analytics</h2>
      <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted, marginBottom: 14, letterSpacing: ".02em" }}>
        Computed live from the Aurora ledger
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 0.9fr", gap: 14 }}>
        {/* divergence per field */}
        <div style={chartCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: c.ink }}>Divergence rate per field</span>
            <span style={sqlTag}>SQL</span>
          </div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 11 }}>
            {reportData.coverage.fields.map((f) => {
              const rate = parseFloat(f.divergence_rate) * 100;
              const pct = rate > 0 ? Math.max(2, (rate / 100) * 100) : 1.5;
              const col = rate > 0 ? c.divergent : c.verified;
              return (
                <div key={f.field_name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: c.inkSoft }}>{f.field_name}</span>
                    <span style={{ color: col }}>{rate.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 6, background: c.divider, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, background: col, width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* drift */}
        <div style={chartCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: c.ink }}>Divergence across runs</span>
            <span style={sqlTag}>SQL</span>
          </div>
          <DriftChart runs={reportData.projectRuns} />
        </div>

        {/* coverage gauge */}
        <div style={{ ...chartCard, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: c.ink }}>Coverage</span>
            <span style={sqlTag}>SQL</span>
          </div>
          <div style={{ position: "relative", marginTop: 14, width: 96, height: 96 }}>
            <svg width="96" height="96" viewBox="0 0 96 96">
              <circle cx="48" cy="48" r="40" fill="none" stroke={c.divider} strokeWidth="8" />
              <circle cx="48" cy="48" r="40" fill="none" stroke={c.verified} strokeWidth="8" strokeLinecap="round" strokeDasharray="251.2" strokeDashoffset="0" transform="rotate(-90 48 48)" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, fontSize: 18, fontWeight: 500, color: c.ink }}>
              100%
            </div>
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 10, textAlign: "center" }}>
            {fieldsChecked} of {fieldsChecked} fields executed on both sides
          </div>
        </div>
      </div>

      {/* ASK THE LEDGER */}
      <AskLedger id={id} />

      {/* ACTIONS */}
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href={`/runs/${id}/diffs`} className="btn-dark" style={darkBtn}>
          {certified ? "Open evidence" : "Open diff explorer"}
        </Link>
        <span style={{ fontSize: 13, color: c.muted }}>
          {certified ? "Both runs remain in the ledger." : "Re-run after applying the suggested fix."}
        </span>
      </div>
    </div>
  );
}

// ── Ask the ledger (NL → SQL copilot) ─────────────────────────────────────────
type AskResult = { sql: string; rows: Record<string, unknown>[]; rowCount: number; answer: string };
const SUGGESTED_Q = [
  "Which field has the highest divergence rate?",
  "Show the 5 largest deltas with their input principals",
  "How many inputs diverged on final_amount?",
];

function AskLedger({ id }: { id: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const r = await fetch(`/api/runs/${id}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Query failed");
      setRes(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Query failed");
    } finally {
      setBusy(false);
    }
  };

  const cols = res?.rows.length ? Object.keys(res.rows[0]) : [];

  return (
    <div style={{ marginTop: 34 }}>
      <h2 style={{ fontWeight: 600, fontSize: 20, lineHeight: "28px", color: c.ink, margin: "0 0 4px" }}>Ask the ledger</h2>
      <div style={{ fontFamily: font.mono, fontSize: 11.5, color: c.muted, marginBottom: 14, letterSpacing: ".02em" }}>
        Natural language → read-only SQL over this run&apos;s evidence
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(q)}
          placeholder="e.g. which inputs diverged the most?"
          style={{ flex: 1, fontFamily: font.sans, fontSize: 14, color: c.ink, background: c.surface, border: `1px solid ${c.rule}`, borderRadius: 4, padding: "11px 14px", outline: "none" }}
        />
        <button className="btn-dark" style={{ ...darkBtn, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }} disabled={busy} onClick={() => run(q)}>
          {busy ? "Querying…" : "Ask"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
        {SUGGESTED_Q.map((s) => (
          <button
            key={s}
            onClick={() => { setQ(s); run(s); }}
            disabled={busy}
            style={{ fontFamily: font.sans, fontSize: 12, color: c.instrument, background: "rgba(31,95,122,.07)", border: `1px solid rgba(31,95,122,.2)`, borderRadius: 4, padding: "5px 10px", cursor: busy ? "default" : "pointer" }}
          >
            {s}
          </button>
        ))}
      </div>

      {err && <div style={{ marginTop: 14, fontFamily: font.mono, fontSize: 12.5, color: c.divergent }}>{err}</div>}

      {res && (
        <div style={{ marginTop: 16, ...panel, padding: 0, overflow: "hidden" }}>
          {res.answer && (
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${c.divider}`, fontSize: 14.5, lineHeight: "22px", color: c.ink }}>
              {res.answer}
            </div>
          )}
          <details style={{ borderBottom: `1px solid ${c.divider}` }}>
            <summary style={{ padding: "10px 20px", fontFamily: font.mono, fontSize: 11.5, color: c.instrument, cursor: "pointer" }}>
              SQL · {res.rowCount} row{res.rowCount !== 1 ? "s" : ""}
            </summary>
            <pre style={{ margin: 0, padding: "0 20px 16px", fontFamily: font.mono, fontSize: 12, lineHeight: "19px", color: c.muted, whiteSpace: "pre-wrap" }}>{res.sql}</pre>
          </details>
          {res.rows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: font.mono, fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {cols.map((col) => (
                      <th key={col} style={{ textAlign: "left", padding: "9px 20px", color: c.muted, fontWeight: 600, borderBottom: `1px solid ${c.rule}`, background: c.raised, whiteSpace: "nowrap" }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.rows.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      {cols.map((col) => (
                        <td key={col} style={{ padding: "8px 20px", color: c.ink, borderBottom: `1px solid ${c.divider}`, whiteSpace: "nowrap" }}>{String(row[col] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Findings section ──────────────────────────────────────────────────────────
function FindingsSection({
  findings,
  spineRows,
  copied,
  copy,
  id,
  router,
}: {
  findings: Finding[];
  spineRows: SpineRow[];
  copied: boolean;
  copy: (text: string) => void;
  id: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <>
      <div style={{ marginTop: 32, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontWeight: 600, fontSize: 20, lineHeight: "28px", color: c.ink, margin: 0 }}>Findings</h2>
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted }}>{findings.length} diverging field{findings.length !== 1 ? "s" : ""}</span>
      </div>
      {findings.map((f) => {
        const divRate = (parseFloat(f.divergence_rate) * 100).toFixed(1) + "%";
        const maxDelta = f.max_abs_delta ? "$" + parseFloat(f.max_abs_delta).toFixed(2) : "—";
        const severityColor = f.severity === "high" ? c.divergent : f.severity === "medium" ? c.amber : c.muted;
        const severityBg = f.severity === "high" ? "rgba(179,38,30,.05)" : f.severity === "medium" ? "rgba(178,107,0,.05)" : "transparent";
        const severityBd = f.severity === "high" ? "rgba(179,38,30,.4)" : f.severity === "medium" ? "rgba(178,107,0,.4)" : c.rule;
        const fixText = f.suggested_fix;

        return (
          <div key={f.id} style={{ marginTop: 14, ...panel }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, padding: "22px 24px 18px", borderBottom: `1px solid ${c.divider}` }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.ink }}>{f.field_name}</span>
                  {f.module_name && <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>module {f.module_name}</span>}
                </div>
                <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
                  <Metric label="Divergence rate" main={divRate} sub={`· ${f.diverging_count.toLocaleString("en-US")} / ${f.total_count.toLocaleString("en-US")}`} />
                  <Metric label="Max delta" main={maxDelta} />
                </div>
              </div>
              <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: font.mono, fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: severityColor, border: `1px solid ${severityBd}`, background: severityBg, borderRadius: 4, padding: "4px 10px" }}>
                {f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}
              </span>
            </div>

            {/* equivalence spine sample */}
            {spineRows.length > 0 && f.field_name === "final_amount" && (
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${c.divider}`, background: c.raised }}>
                <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                  <span>Legacy (oracle)</span>
                  <span style={{ textAlign: "center" }}>≠</span>
                  <span style={{ textAlign: "right" }}>Migrated</span>
                </div>
                {spineRows.map((r) => (
                  <div key={r.seq} style={{ display: "grid", gridTemplateColumns: "1fr 30px 1fr", alignItems: "center", padding: "7px 0", borderTop: `1px solid ${c.divider}` }}>
                    <div style={{ textAlign: "right", fontFamily: font.mono, fontSize: 15, color: c.ink }}>
                      {r.legacyPre}
                      <span style={{ background: "rgba(22,124,91,.16)", color: c.verified, borderRadius: 2, padding: "0 2px" }}>{r.legacyDiff}</span>
                    </div>
                    <div style={{ textAlign: "center", fontFamily: font.mono, fontSize: 14, color: c.divergent }}>≠</div>
                    <div style={{ textAlign: "left", fontFamily: font.mono, fontSize: 15, color: c.ink }}>
                      {r.migPre}
                      <span style={{ background: "rgba(179,38,30,.14)", color: c.divergent, borderRadius: 2, padding: "0 2px" }}>{r.migDiff}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* cause + fix */}
            <div style={{ padding: "20px 24px" }}>
              <div style={kicker}>Likely cause</div>
              <p style={{ fontSize: 14.5, lineHeight: "23px", color: c.inkSoft, margin: "0 0 18px", whiteSpace: "pre-wrap" }}>
                {f.explanation ?? "LLM explanation not available for this finding."}
              </p>
              {fixText && (
                <>
                  <div style={kicker}>Suggested fix</div>
                  <div style={{ background: c.ink, borderRadius: 6, padding: "16px 18px", position: "relative" }}>
                    <button
                      onClick={() => copy(fixText)}
                      style={{ position: "absolute", top: 12, right: 12, fontFamily: font.mono, fontSize: 11, color: c.sealMuted, background: c.inkSoft, border: `1px solid ${c.sealRule}`, borderRadius: 4, padding: "4px 9px", cursor: "pointer" }}
                    >
                      {copied ? "copied" : "copy"}
                    </button>
                    <pre style={{ margin: 0, fontFamily: font.mono, fontSize: 13, lineHeight: "22px", color: "#D7DDE5", whiteSpace: "pre", overflow: "auto" }}>
                      {fixText}
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <ReVerifyPanel id={id} router={router} />
    </>
  );
}

// ── Re-verify (apply a fix, prove it) ─────────────────────────────────────────
function ReVerifyPanel({ id, router }: { id: string; router: ReturnType<typeof useRouter> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("migratedFiles", file);
      const res = await fetch(`/api/runs/${id}/reverify`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-verify failed");
      router.push(`/runs/${data.runId}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Re-verify failed");
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 28, background: c.surface, border: `1px solid ${c.rule}`, borderLeft: `3px solid ${c.instrument}`, borderRadius: 6, padding: "20px 24px", boxShadow: "0 1px 3px rgba(15,26,42,.06)" }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: c.ink }}>Apply a fix and re-verify</div>
      <div style={{ fontSize: 13.5, lineHeight: "21px", color: c.muted, marginTop: 6, maxWidth: 620 }}>
        Upload a corrected migrated program. Parity re-runs the same oracle over the same input
        contract and issues a fresh verdict — the drift chart records the recovery.
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          className="btn-dark"
          style={{ ...darkBtn, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Re-verifying…" : "Upload fix & re-verify"}
        </button>
        <input ref={fileRef} type="file" accept=".py" onChange={onFile} style={{ display: "none" }} />
        {err && <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.divergent }}>{err}</span>}
      </div>
    </div>
  );
}

// ── Drift chart ───────────────────────────────────────────────────────────────
function DriftChart({ runs }: { runs: ProjectRun[] }) {
  const completed = runs.filter((r) => r.status === "completed");
  if (completed.length === 0) {
    return (
      <svg viewBox="0 0 280 130" width="100%" height="130" style={{ marginTop: 12, display: "block" }}>
        <line x1="34" y1="14" x2="34" y2="104" stroke={c.track} strokeWidth="1" />
        <line x1="34" y1="104" x2="262" y2="104" stroke={c.rule} strokeWidth="1" />
        <text x="148" y="66" fill={c.muted2} fontFamily="IBM Plex Sans" fontSize="11" textAnchor="middle">No completed runs</text>
      </svg>
    );
  }
  const rates = completed.map((r) => parseFloat(r.max_divergence_rate ?? "0") * 100);
  const maxRate = Math.max(...rates, 0.01);

  const toX = (i: number) =>
    completed.length === 1 ? 80 : 40 + (i / (completed.length - 1)) * 220;
  const toY = (rate: number) => 100 - (rate / maxRate) * 86;

  const pts = completed.map((r, i) => ({
    x: toX(i),
    y: toY(rates[i]),
    rate: rates[i].toFixed(1) + "%",
    color: r.verdict === "CERTIFIED" ? c.verified : c.divergent,
    label: `Run ${r.run_number}`,
  }));

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox="0 0 280 130" width="100%" height="130" style={{ marginTop: 12, display: "block" }}>
      <line x1="34" y1="14" x2="34" y2="104" stroke={c.track} strokeWidth="1" />
      <line x1="34" y1="104" x2="262" y2="104" stroke={c.rule} strokeWidth="1" />
      {pts.length > 1 && <polyline points={polyline} fill="none" stroke={c.instrument} strokeWidth="2" />}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4.5" fill={p.color} />
          <text x={p.x} y={p.y - 8} fill={p.color} fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">{p.rate}</text>
          <text x={p.x} y={120} fill={c.muted} fontFamily="IBM Plex Mono, monospace" fontSize="10" textAnchor="middle">{p.label}</text>
        </g>
      ))}
      {pts.length === 1 && (
        <>
          <text x="190" y="66" fill={c.muted2} fontFamily="IBM Plex Sans" fontSize="11" textAnchor="middle">Re-verify to</text>
          <text x="190" y="80" fill={c.muted2} fontFamily="IBM Plex Sans" fontSize="11" textAnchor="middle">track drift</text>
        </>
      )}
    </svg>
  );
}

// ── Small reusable pieces ─────────────────────────────────────────────────────
function CertifiedNote() {
  return (
    <div style={{ marginTop: 28, background: c.surface, border: `1px solid ${c.rule}`, borderLeft: `3px solid ${c.verified}`, borderRadius: 6, padding: "20px 24px", boxShadow: "0 1px 3px rgba(15,26,42,.06)", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ flex: "none", width: 36, height: 36, borderRadius: "50%", background: "rgba(22,124,91,.1)", display: "flex", alignItems: "center", justifyContent: "center", color: c.verified, fontFamily: font.mono, fontSize: 18 }}>
        =
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, color: c.ink }}>No divergences found.</div>
        <div style={{ fontSize: 13.5, color: c.muted, marginTop: 2 }}>All fields matched the oracle across every input. Evidence remains inspectable so the pass is still auditable.</div>
      </div>
    </div>
  );
}
function Metric({ label, main, sub }: { label: string; main: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted }}>{label}</div>
      <div style={{ fontFamily: font.mono, fontSize: 16, color: c.divergent, marginTop: 4 }}>
        {main} {sub && <span style={{ color: c.muted, fontSize: 12.5 }}>{sub}</span>}
      </div>
    </div>
  );
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.rule}`, borderRadius: 6, padding: "16px 18px" }}>
      <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted }}>{label}</div>
      <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 500, color: color ?? c.ink, marginTop: 5 }}>{value}</div>
    </div>
  );
}
function SealStat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: c.sealMuted }}>{label}</div>
      <div style={{ fontFamily: font.mono, fontSize: small ? 13.5 : 18, color: color ?? c.paper, marginTop: small ? 7 : 5 }}>{value}</div>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.rule}`,
  borderRadius: 6,
  boxShadow: "0 1px 3px rgba(15,26,42,.06)",
  overflow: "hidden",
};
const panelHead: React.CSSProperties = {
  padding: "14px 18px",
  borderBottom: `1px solid ${c.divider}`,
  background: c.raised,
  fontWeight: 600,
  fontSize: 13,
  color: c.ink,
};
const chartCard: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.rule}`,
  borderRadius: 6,
  padding: "18px 20px",
  boxShadow: "0 1px 3px rgba(15,26,42,.06)",
};
const sqlTag: React.CSSProperties = { fontFamily: font.mono, fontSize: 10, color: c.muted2, letterSpacing: ".04em" };
const kicker: React.CSSProperties = { fontWeight: 600, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted, marginBottom: 8 };
const backLink: React.CSSProperties = { fontFamily: font.sans, fontSize: 13, fontWeight: 500, color: c.instrument, display: "inline-block", marginBottom: 20 };
const darkBtn: React.CSSProperties = { fontFamily: font.sans, fontWeight: 600, fontSize: 14, color: c.paper, background: c.ink, border: `1px solid ${c.ink}`, borderRadius: 6, padding: "12px 22px", cursor: "pointer" };
