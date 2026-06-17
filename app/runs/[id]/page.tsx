"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { c, font } from "@/lib/tokens";
import {
  fieldBars,
  runMeta,
  spineRows,
  styleStep,
  suggestedFix,
  trajectory,
} from "@/lib/mock";

export default function RunPage() {
  return (
    <Suspense fallback={null}>
      <RunView />
    </Suspense>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function RunView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const id = params.id;
  const certified = search.get("fix") === "1" || id === "8f3a2d";
  const wantRunning = search.get("running") === "1";

  const [phase, setPhase] = useState<"verifying" | "report">(wantRunning ? "verifying" : "report");
  const [t, setT] = useState(wantRunning ? 0 : 1);
  const [stamped, setStamped] = useState(!wantRunning);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== "verifying") return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setT(1);
      const a = setTimeout(() => setPhase("report"), 200);
      const b = setTimeout(() => setStamped(true), 260);
      return () => {
        clearTimeout(a);
        clearTimeout(b);
      };
    }
    const start = Date.now();
    const dur = 5200;
    timer.current = setInterval(() => {
      let nt = (Date.now() - start) / dur;
      if (nt >= 1) {
        nt = 1;
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setT(1);
        setTimeout(() => setPhase("report"), 420);
        setTimeout(() => setStamped(true), 560);
      } else {
        setT(nt);
      }
    }, 40);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "verifying") return <Verifying id={id} certified={certified} t={t} />;
  return <Report id={id} certified={certified} stamped={stamped} router={router} />;
}

// ── Verifying (investigation theater) ─────────────────────────────────────────
function Verifying({ id, certified, t }: { id: string; certified: boolean; t: number }) {
  const traj = trajectory(certified);
  const n = traj.length;
  const trajRows = traj
    .map((s, i) => ({ ...styleStep(s), r: ((i + 0.6) / n) * 0.84 }))
    .filter((r) => t >= r.r || t >= 1);
  const investDone = t >= 1;
  const probesStr = fmt(Math.min(1, t / 0.84) * 412);
  const comparesStr = fmt(Math.min(1, t) * 20000);
  const divFoundN = Math.max(0, Math.min(1, (t - 0.34) / 0.66)) * (certified ? 0 : 312);
  const riskRows = [
    { name: "interest_calc", sub: "compounding loop · monetary rounding", level: "High", barPct: 88, focus: t >= 0.08 && t < 0.72 },
    { name: "payroll", sub: "tax withholding", level: "Medium", barPct: 46, focus: t >= 0.72 },
  ].map((r) => ({
    ...r,
    ring: r.focus ? c.instrument : c.track,
    focusLabel: r.focus ? "Focusing" : "Queued",
    focusColor: r.focus ? c.instrument : c.muted2,
  }));
  const handoffText = certified
    ? "Investigation complete — no divergence surfaced. Handing off to the oracle for ruling."
    : "Investigation complete — handing the proven divergence to the oracle for ruling.";

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: c.instrument,
            boxShadow: "0 0 0 4px rgba(31,95,122,.13)",
          }}
        />
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

      {/* two-voice legend */}
      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", fontSize: 12.5, color: c.muted }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.instrument }} />
          <span>
            <b style={{ color: c.instrument, fontWeight: 600 }}>Investigator</b> — reasons &amp; probes, provisional
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: c.ink }} />
          <span>
            <b style={{ color: c.ink, fontWeight: 600 }}>Oracle ruling</b> — deterministic, authoritative
          </span>
        </div>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.62fr 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT: trajectory feed */}
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
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "54px 1fr", gap: 12, padding: "12px 0", borderBottom: `1px solid ${c.divider2}`, animation: "paRise 260ms ease both" }}
              >
                <div style={{ fontFamily: font.mono, fontSize: 11, color: c.muted2, paddingTop: 2 }}>{s.at}</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ width: 9, height: 9, borderRadius: s.markerRadius, background: s.markerColor, flex: "none" }} />
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: ".05em",
                        textTransform: "uppercase",
                        color: s.chipColor,
                        background: s.chipBg,
                        borderRadius: 3,
                        padding: "2px 7px",
                      }}
                    >
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
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "13px 15px", background: c.ink, borderRadius: 6, animation: "paRise 300ms ease both" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.accentLt, flex: "none" }} />
                <span style={{ fontSize: 13, lineHeight: "20px", color: c.sealText }}>{handoffText}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: risk map + counters */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={panel}>
            <div style={panelHead}>
              Risk map <span style={{ fontWeight: 400, color: c.muted, fontSize: 12 }}>· legacy surface</span>
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {riskRows.map((m) => (
                <div key={m.name} style={{ border: `1px solid ${m.ring}`, borderRadius: 6, padding: "12px 13px", transition: "border-color .2s ease" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 500, color: c.ink }}>{m.name}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: m.focusColor }}>
                      {m.focusLabel}
                    </span>
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

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 12.5, color: c.inkSoft }}>{label}</span>
      <span style={{ fontFamily: font.mono, fontSize: 15, color: c.ink }}>{value}</span>
    </div>
  );
}

// ── Report ────────────────────────────────────────────────────────────────────
function Report({
  id,
  certified,
  stamped,
  router,
}: {
  id: string;
  certified: boolean;
  stamped: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const m = runMeta(certified);
  const bars = fieldBars(certified);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(suggestedFix);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 32px 80px" }}>
      <Link href="/projects" style={backLink}>
        ← Projects
      </Link>

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
        <div
          style={{
            position: "absolute",
            right: -10,
            top: -30,
            fontFamily: font.serif,
            fontSize: 230,
            lineHeight: 1,
            color: "rgba(255,255,255,.035)",
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          {m.sealMark}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <span style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: c.sealMuted }}>
            Certificate of verification
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: c.sealMuted }}>run_{id}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 18, position: "relative" }}>
          <span style={{ fontFamily: font.serif, fontWeight: 500, fontSize: 46, lineHeight: 1, color: m.verdictColor }}>
            {m.verdictWord}
          </span>
        </div>
        <div style={{ fontFamily: font.sans, fontSize: 15, lineHeight: "23px", color: c.sealText, marginTop: 12, maxWidth: 560, position: "relative" }}>
          {m.verdictSummary}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18, marginTop: 26, paddingTop: 22, borderTop: `1px solid ${c.sealRule}`, position: "relative" }}>
          <SealStat label="Inputs verified" value="10,000" />
          <SealStat label="Fields checked" value="2" />
          <SealStat label="Findings" value={m.findingCount} color={m.verdictColor} />
          <SealStat label="Issued" value="Jun 17, 2026 · 14:32 UTC" small />
        </div>
      </div>

      {/* SUMMARY BAND */}
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <Stat label="Inputs verified" value="10,000" />
        <Stat label="Fields checked" value="2" />
        <Stat label="Diverging inputs" value={m.divergingInputs} color={m.verdictColor2} />
        <Stat label="Coverage" value="100%" color={c.verified} />
      </div>

      {/* FINDINGS / CERTIFIED */}
      {!certified ? <Findings copied={copied} copy={copy} router={router} id={id} /> : <CertifiedNote />}

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
            {bars.map((b) => (
              <div key={b.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: font.mono, fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: c.inkSoft }}>{b.label}</span>
                  <span style={{ color: b.color }}>{b.rate}</span>
                </div>
                <div style={{ height: 6, background: c.divider, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: b.color, width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* drift */}
        <div style={chartCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: c.ink }}>Divergence across runs</span>
            <span style={sqlTag}>SQL</span>
          </div>
          {certified ? <DriftCertified /> : <DriftNotCertified />}
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
            2 of 2 fields executed on both sides
          </div>
        </div>
      </div>

      {/* ACTIONS */}
      <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href={`/runs/${id}/diffs?certified=${certified ? 1 : 0}`} className="btn-dark" style={darkBtn}>
          {m.evidenceLabel}
        </Link>
        <button onClick={() => router.push("/runs/8f3a2d?running=1&fix=1")} className="btn-ghost" style={ghostBtn}>
          Re-verify
        </button>
        <span style={{ fontSize: 13, color: c.muted }}>{m.reVerifyHint}</span>
      </div>
    </div>
  );
}

function Findings({
  copied,
  copy,
  router,
  id,
}: {
  copied: boolean;
  copy: () => void;
  router: ReturnType<typeof useRouter>;
  id: string;
}) {
  return (
    <>
      <div style={{ marginTop: 32, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontWeight: 600, fontSize: 20, lineHeight: "28px", color: c.ink, margin: 0 }}>Findings</h2>
        <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted }}>1 diverging field</span>
      </div>
      <div style={{ marginTop: 14, ...panel }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, padding: "22px 24px 18px", borderBottom: `1px solid ${c.divider}` }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 600, color: c.ink }}>final_amount</span>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.muted }}>module interest_calc</span>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
              <Metric label="Divergence rate" main="3.1%" sub="· 312 / 10,000" />
              <Metric label="Max delta" main="$0.01" />
            </div>
          </div>
          <span
            style={{
              flex: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: c.divergent,
              border: "1px solid rgba(179,38,30,.4)",
              background: "rgba(179,38,30,.05)",
              borderRadius: 4,
              padding: "4px 10px",
            }}
          >
            Critical
          </span>
        </div>

        {/* equivalence spine sample */}
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
          <p style={{ fontSize: 14.5, lineHeight: "23px", color: c.inkSoft, margin: "0 0 18px" }}>
            On 312 inputs, an intermediate step of the <Code>final_amount</Code> compounding loop lands exactly on a
            half-cent. COBOL&apos;s <Code>COMPUTE … ROUNDED</Code> on fixed-decimal rounds half away from zero (…x.xx5 → up);
            the migrated Python recomputes with float arithmetic and the built-in <Code>round()</Code>, which applies
            banker&apos;s rounding (round half to even). The error compounds over the term, so the two agree everywhere
            except these ties — where they differ by one cent.
          </p>
          <div style={kicker}>Suggested fix</div>
          <div style={{ background: c.ink, borderRadius: 6, padding: "16px 18px", position: "relative" }}>
            <button
              onClick={copy}
              style={{ position: "absolute", top: 12, right: 12, fontFamily: font.mono, fontSize: 11, color: c.sealMuted, background: c.inkSoft, border: `1px solid ${c.sealRule}`, borderRadius: 4, padding: "4px 9px", cursor: "pointer" }}
            >
              {copied ? "copied" : "copy"}
            </button>
            <pre style={{ margin: 0, fontFamily: font.mono, fontSize: 13, lineHeight: "22px", color: "#D7DDE5", whiteSpace: "pre", overflow: "auto" }}>
              {suggestedFix}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}

function CertifiedNote() {
  return (
    <div
      style={{
        marginTop: 28,
        background: c.surface,
        border: `1px solid ${c.rule}`,
        borderLeft: `3px solid ${c.verified}`,
        borderRadius: 6,
        padding: "20px 24px",
        boxShadow: "0 1px 3px rgba(15,26,42,.06)",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ flex: "none", width: 36, height: 36, borderRadius: "50%", background: "rgba(22,124,91,.1)", display: "flex", alignItems: "center", justifyContent: "center", color: c.verified, fontFamily: font.mono, fontSize: 18 }}>
        =
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, color: c.ink }}>No divergences found.</div>
        <div style={{ fontSize: 13.5, color: c.muted, marginTop: 2 }}>
          All fields matched the oracle across every input. Evidence remains inspectable so the pass is still auditable.
        </div>
      </div>
    </div>
  );
}

function DriftNotCertified() {
  return (
    <svg viewBox="0 0 280 130" width="100%" height="130" style={{ marginTop: 12, display: "block" }}>
      <line x1="34" y1="14" x2="34" y2="104" stroke={c.track} strokeWidth="1" />
      <line x1="34" y1="104" x2="262" y2="104" stroke={c.rule} strokeWidth="1" />
      <circle cx="80" cy="34" r="4.5" fill={c.divergent} />
      <text x="80" y="24" fill={c.divergent} fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">3.1%</text>
      <text x="80" y="120" fill={c.muted} fontFamily="IBM Plex Mono, monospace" fontSize="10" textAnchor="middle">Run 1</text>
      <text x="200" y="66" fill={c.muted2} fontFamily="IBM Plex Sans" fontSize="11" textAnchor="middle">Re-verify to</text>
      <text x="200" y="80" fill={c.muted2} fontFamily="IBM Plex Sans" fontSize="11" textAnchor="middle">track drift</text>
    </svg>
  );
}

function DriftCertified() {
  return (
    <svg viewBox="0 0 280 130" width="100%" height="130" style={{ marginTop: 12, display: "block" }}>
      <line x1="34" y1="14" x2="34" y2="104" stroke={c.track} strokeWidth="1" />
      <line x1="34" y1="104" x2="262" y2="104" stroke={c.rule} strokeWidth="1" />
      <polyline points="70,34 226,104" fill="none" stroke={c.instrument} strokeWidth="2" />
      <circle cx="70" cy="34" r="4.5" fill={c.divergent} />
      <circle cx="226" cy="104" r="4.5" fill={c.verified} />
      <text x="70" y="24" fill={c.divergent} fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">3.1%</text>
      <text x="226" y="94" fill={c.verified} fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">0.0%</text>
      <text x="70" y="120" fill={c.muted} fontFamily="IBM Plex Mono, monospace" fontSize="10" textAnchor="middle">Run 1</text>
      <text x="226" y="120" fill={c.muted} fontFamily="IBM Plex Mono, monospace" fontSize="10" textAnchor="middle">Run 2</text>
    </svg>
  );
}

// ── small pieces ──────────────────────────────────────────────────────────────
function Code({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: font.mono, fontSize: 13 }}>{children}</span>;
}
function Arrow() {
  return <span style={{ color: c.muted2, fontFamily: font.mono, fontSize: 12 }}>→</span>;
}
function ProvChip({ text, danger }: { text: string; danger?: boolean }) {
  return (
    <span
      style={{
        fontFamily: font.mono,
        fontSize: 11.5,
        color: danger ? c.divergent : c.instrument,
        background: danger ? "rgba(179,38,30,.06)" : "rgba(31,95,122,.08)",
        border: `1px solid ${danger ? "rgba(179,38,30,.25)" : "rgba(31,95,122,.2)"}`,
        borderRadius: 4,
        padding: "5px 10px",
      }}
    >
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
const sqlTag: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: 10,
  color: c.muted2,
  letterSpacing: ".04em",
};
const kicker: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: c.muted,
  marginBottom: 8,
};
const backLink: React.CSSProperties = {
  fontFamily: font.sans,
  fontSize: 13,
  fontWeight: 500,
  color: c.instrument,
  display: "inline-block",
  marginBottom: 20,
};
const darkBtn: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 600,
  fontSize: 14,
  color: c.paper,
  background: c.ink,
  border: `1px solid ${c.ink}`,
  borderRadius: 6,
  padding: "12px 22px",
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 600,
  fontSize: 14,
  color: c.ink,
  background: c.surface,
  border: `1px solid ${c.dashBorder}`,
  borderRadius: 6,
  padding: "12px 22px",
  cursor: "pointer",
};
