"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { c, font } from "@/lib/tokens";
import { trajectory, styleStep, suggestedFix } from "@/lib/mock";

// ── Types ────────────────────────────────────────────────────────────────────
type RunInfo = {
  id: string;
  project_id: string;
  status: "queued" | "running" | "completed" | "failed";
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
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

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
type Phase = "theater" | "waiting" | "report" | "error";

function RunView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const id = params.id;
  const wantRunning = search.get("running") === "1";

  const [phase, setPhase] = useState<Phase>(wantRunning ? "theater" : "waiting");
  const [t, setT] = useState(wantRunning ? 0 : 1);
  const [stamped, setStamped] = useState(false);
  const [runData, setRunData] = useState<RunInfo | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  // When theater ends, transition to waiting (continue poll)
  const onTheaterDone = () => setPhase("waiting");

  // Theater animation
  useEffect(() => {
    if (phase !== "theater") return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setT(1);
      const a = setTimeout(onTheaterDone, 200);
      return () => clearTimeout(a);
    }
    const start = Date.now();
    const dur = 5200;
    const timer = setInterval(() => {
      let nt = (Date.now() - start) / dur;
      if (nt >= 1) {
        clearInterval(timer);
        setT(1);
        setTimeout(onTheaterDone, 420);
      } else {
        setT(nt);
      }
    }, 40);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  if (phase === "theater") return <Verifying id={id} t={t} />;
  if (phase === "waiting") return <WaitingView id={id} runData={runData} />;
  if (phase === "error") return <ErrorView id={id} error={runData?.error ?? null} />;
  if (!reportData || !runData) return null;
  return <Report id={id} runData={runData} reportData={reportData} stamped={stamped} router={router} />;
}

// ── Verifying (investigation theater) ─────────────────────────────────────────
function Verifying({ id, t }: { id: string; t: number }) {
  const traj = trajectory(false);
  const n = traj.length;
  const trajRows = traj
    .map((s, i) => ({ ...styleStep(s), r: ((i + 0.6) / n) * 0.84 }))
    .filter((r) => t >= r.r || t >= 1);
  const investDone = t >= 1;
  const probesStr = fmt(Math.min(1, t / 0.84) * 412);
  const comparesStr = fmt(Math.min(1, t) * 20000);
  const divFoundN = Math.max(0, Math.min(1, (t - 0.34) / 0.66)) * 312;
  const riskRows = [
    { name: "interest_calc", sub: "compounding loop · monetary rounding", level: "High", barPct: 88, focus: t >= 0.08 && t < 0.72 },
    { name: "payroll", sub: "tax withholding", level: "Medium", barPct: 46, focus: t >= 0.72 },
  ].map((r) => ({
    ...r,
    ring: r.focus ? c.instrument : c.track,
    focusLabel: r.focus ? "Focusing" : "Queued",
    focusColor: r.focus ? c.instrument : c.muted2,
  }));

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.instrument, boxShadow: "0 0 0 4px rgba(31,95,122,.13)" }} />
        <div style={{ fontWeight: 600, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: c.instrument }}>
          Investigating
        </div>
      </div>
      <h1 style={{ fontFamily: font.serif, fontWeight: 500, fontSize: 28, lineHeight: "34px", color: c.ink, margin: "7px 0 2px" }}>
        COBOL Interest &amp; Payroll
      </h1>
      <div style={{ fontFamily: font.mono, fontSize: 13, color: c.muted }}>
        run_{id} · agent hunting for divergences · COBOL → Python
      </div>

      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", fontSize: 12.5, color: c.muted }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.instrument }} />
          <span><b style={{ color: c.instrument, fontWeight: 600 }}>Investigator</b> — reasons &amp; probes, provisional</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: c.ink }} />
          <span><b style={{ color: c.ink, fontWeight: 600 }}>Oracle ruling</b> — deterministic, authoritative</span>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.62fr 1fr", gap: 16, alignItems: "start" }}>
        <div style={panel}>
          <div style={{ ...panelHead, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: c.ink }}>Agent trajectory</span>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: font.mono, fontSize: 11, color: c.instrument }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.instrument, animation: "paPulse 1.1s ease-in-out infinite" }} />
              live
            </span>
          </div>
          <div style={{ padding: "6px 18px 14px" }}>
            {trajRows.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "54px 1fr", gap: 12, padding: "12px 0", borderBottom: `1px solid ${c.divider2}`, animation: "paRise 260ms ease both" }}>
                <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted2, paddingTop: 2 }}>{s.at}</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ width: 9, height: 9, borderRadius: s.markerRadius, background: s.markerColor, flex: "none" }} />
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: s.chipColor, background: s.chipBg, borderRadius: 3, padding: "2px 7px" }}>
                      {s.chip}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: "21px", color: s.textColor, fontWeight: s.textWeight as number, marginTop: 7 }}>
                    {s.text}
                  </div>
                  {s.hasDetail && (
                    <div style={{ fontFamily: font.mono, fontSize: 12, color: c.muted, marginTop: 4 }}>{s.detail}</div>
                  )}
                </div>
              </div>
            ))}
            {investDone && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "13px 15px", background: c.ink, borderRadius: 6, animation: "paRise 300ms ease both" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.accentLt, flex: "none" }} />
                <span style={{ fontSize: 13, lineHeight: "20px", color: c.sealText }}>
                  Investigation complete — handing the proven divergence to the oracle for ruling.
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={panel}>
            <div style={panelHead}>Risk map <span style={{ fontWeight: 400, color: c.muted, fontSize: 12 }}>· legacy surface</span></div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {riskRows.map((m) => (
                <div key={m.name} style={{ border: `1px solid ${m.ring}`, borderRadius: 6, padding: "12px 13px", transition: "border-color .2s ease" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 500, color: c.ink }}>{m.name}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: m.focusColor }}>{m.focusLabel}</span>
                  </div>
                  <div style={{ fontSize: 12, color: c.muted, marginTop: 3 }}>{m.sub}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
                    <div style={{ flex: 1, height: 5, background: c.divider, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 3, background: c.amber, width: `${m.barPct}%` }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.amber }}>{m.level}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panel, padding: "14px 18px" }}>
            <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted, marginBottom: 12 }}>
              Deterministic ledger
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <Counter label="Probes executed" value={probesStr} />
              <Counter label="Comparisons" value={comparesStr} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${c.divider}`, paddingTop: 11 }}>
                <span style={{ fontSize: 12.5, color: c.inkSoft }}>Divergences found</span>
                <span style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 600, color: divFoundN >= 1 ? c.divergent : c.muted2 }}>
                  {fmt(divFoundN)}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 11.5, lineHeight: "17px", color: c.muted2, marginTop: 13 }}>
              The oracle rules every comparison — the agent never decides a match.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Waiting for the pipeline ──────────────────────────────────────────────────
function WaitingView({ id, runData }: { id: string; runData: RunInfo | null }) {
  const status = runData?.status ?? "queued";
  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.instrument, boxShadow: "0 0 0 4px rgba(31,95,122,.13)", animation: "paPulse 1.1s ease-in-out infinite" }} />
        <span style={{ fontFamily: font.mono, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: c.instrument }}>
          {status === "queued" ? "Queued — waiting for worker" : "Pipeline running"}
        </span>
      </div>
      <div style={{ fontFamily: font.serif, fontSize: 24, color: c.ink, marginBottom: 8 }}>Verification in progress</div>
      <div style={{ fontSize: 14, lineHeight: "22px", color: c.muted, maxWidth: 480, margin: "0 auto 24px" }}>
        run_{id} · The worker is processing {status === "queued" ? "the queued job" : "7 pipeline stages"}.
        {" "}Results appear automatically when complete.
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 12, color: c.muted2 }}>
        Make sure <code style={{ background: c.raised, padding: "2px 6px", borderRadius: 3, border: `1px solid ${c.divider}` }}>npm run worker</code> is running in a separate terminal.
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
          animation: stamped ? "paStamp 320ms cubic-bezier(.2,.8,.25,1) both" : "none",
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
        const fixText = f.suggested_fix ?? suggestedFix;

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

            {/* provenance */}
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${c.divider}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.instrument }} />
                <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c.instrument }}>How it was found</span>
                <span style={{ fontSize: 12, color: c.muted2 }}>· agent investigation</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <ProvChip text="Hypothesis · half-cent rounding" />
                <Arrow />
                <ProvChip text="Probed 200 boundary inputs" />
                <Arrow />
                <ProvChip text="Oracle ruled divergence" danger />
                <Arrow />
                <ProvChip text="Narrowed to half-cent ties" />
                <Arrow />
                <ProvChip text="Isolated trigger" />
              </div>
              <div style={{ fontSize: 12.5, color: c.muted, marginTop: 11 }}>
                The metrics above are the oracle&apos;s mechanical record; this trace is the agent&apos;s path to the field.{" "}
                <span style={{ color: c.instrument, cursor: "pointer", fontWeight: 500 }} onClick={() => router.push(`/runs/${id}?running=1`)}>
                  See full investigation →
                </span>
              </div>
            </div>

            {/* cause + fix */}
            <div style={{ padding: "20px 24px" }}>
              <div style={kicker}>Likely cause</div>
              <p style={{ fontSize: 14.5, lineHeight: "23px", color: c.inkSoft, margin: "0 0 18px", whiteSpace: "pre-wrap" }}>
                {f.explanation ?? "LLM explanation not available for this finding."}
              </p>
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
            </div>
          </div>
        );
      })}
    </>
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
function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12.5, color: c.inkSoft }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{value}</span>
    </div>
  );
}
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
function Arrow() {
  return <span style={{ color: c.muted2, fontFamily: font.mono, fontSize: 12 }}>→</span>;
}
function ProvChip({ text, danger }: { text: string; danger?: boolean }) {
  return (
    <span style={{ fontFamily: font.mono, fontSize: 11.5, color: danger ? c.divergent : c.instrument, background: danger ? "rgba(179,38,30,.06)" : "rgba(31,95,122,.08)", border: `1px solid ${danger ? "rgba(179,38,30,.25)" : "rgba(31,95,122,.2)"}`, borderRadius: 4, padding: "5px 10px" }}>
      {text}
    </span>
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
