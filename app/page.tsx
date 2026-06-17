"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { c, font } from "@/lib/tokens";
import SpineHero from "./components/landing/SpineHero";
import { useCountUp, useInView, useReducedMotion } from "./components/landing/anim";

export default function Landing() {
  return (
    <main>
      <Hero />
      <Problem />
      <HowItWorks />
      <SealSection />
      <Ledger />
      <Independence />
      <FinalCta />
      <Footer />
    </main>
  );
}

// ── Reveal-on-scroll wrapper (feedback / progressive disclosure) ──────────────
function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const on = inView || reduce;
  return (
    <div
      ref={ref}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : "translateY(16px)",
        transition: reduce ? "none" : `opacity .6s ease ${delay}ms, transform .6s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        backgroundImage: `linear-gradient(${c.rule}26 1px, transparent 1px), linear-gradient(90deg, ${c.rule}26 1px, transparent 1px)`,
        backgroundSize: "34px 34px",
      }}
    >
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 90% at 70% 0%, transparent 40%, ${c.paper} 78%)`, pointerEvents: "none" }}
      />
      <div style={{ position: "relative", maxWidth: 1120, margin: "0 auto", padding: "72px 32px 76px", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 56, alignItems: "center" }}>
        <div>
          <div style={chip}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.instrument }} />
            Independent verification layer
          </div>
          <h1 style={{ fontFamily: font.serif, fontWeight: 500, fontSize: 52, lineHeight: "58px", color: c.ink, margin: "20px 0 0", letterSpacing: "-.01em" }}>
            Prove the migration behaves <span style={{ color: c.instrument }}>identically</span>.
            <br />
            To the cent.
          </h1>
          <p style={{ fontSize: 17, lineHeight: "27px", color: c.muted, margin: "20px 0 0", maxWidth: 520 }}>
            Upload a legacy program and its AI-migrated version. Parity runs both in an isolated sandbox
            over thousands of generated inputs, compares every field against the original, localizes any
            divergence, and issues a verdict you can sign.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 30, flexWrap: "wrap" }}>
            <Link href="/verify/new" className="btn-dark" style={btnPrimary}>
              Run the live demo
            </Link>
            <Link href="/projects" className="btn-ghost" style={btnGhost}>
              Explore the ledger →
            </Link>
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 12, color: c.muted2, marginTop: 22, display: "flex", gap: 18, flexWrap: "wrap" }}>
            <span>= no mainframe required</span>
            <span>= sandboxed execution</span>
            <span>= every verdict auditable</span>
          </div>
        </div>
        <SpineHero />
      </div>
    </section>
  );
}

// ── Problem ─────────────────────────────────────────────────────────────────────
function Problem() {
  return (
    <section style={{ borderTop: `1px solid ${c.rule}`, background: c.surface }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
        <Reveal>
          <div style={eyebrow}>The problem</div>
          <h2 style={h2}>Migrations that look correct aren&apos;t.</h2>
          <p style={{ fontSize: 16, lineHeight: "26px", color: c.muted, marginTop: 14, maxWidth: 480 }}>
            An AI migration can pass review, compile cleanly, and still diverge from the original on a
            fraction of inputs — a rounding mode here, a float-vs-decimal there. In financial code, a
            one-cent difference compounded over millions of records is a material defect.
          </p>
          <p style={{ fontSize: 16, lineHeight: "26px", color: c.muted, marginTop: 14, maxWidth: 480 }}>
            Spot checks miss it. Parity doesn&apos;t — it compares behavior empirically, field by field,
            against the legacy program as the oracle.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div style={{ background: c.paper, border: `1px solid ${c.rule}`, borderRadius: 8, padding: "24px 26px", boxShadow: "0 1px 3px rgba(15,26,42,.06)" }}>
            <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: c.muted, marginBottom: 14 }}>
              One input · final_amount
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 34px 1fr", alignItems: "center", gap: 8 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: c.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Legacy</div>
                <div style={{ fontFamily: font.mono, fontSize: 22, color: c.ink }}>
                  $6,145.7<span style={{ background: "rgba(22,124,91,.16)", color: c.verified, borderRadius: 2, padding: "0 2px" }}>1</span>
                </div>
              </div>
              <div style={{ textAlign: "center", fontFamily: font.mono, fontSize: 20, color: c.divergent, fontWeight: 600 }}>≠</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 10, color: c.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Migrated</div>
                <div style={{ fontFamily: font.mono, fontSize: 22, color: c.ink }}>
                  $6,145.7<span style={{ background: "rgba(179,38,30,.14)", color: c.divergent, borderRadius: 2, padding: "0 2px" }}>0</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${c.rule}`, fontSize: 13, lineHeight: "21px", color: c.muted }}>
              The compounding loop lands on a half-cent. COBOL rounds half away from zero; the Python
              migration uses banker&apos;s rounding. They agree everywhere — except here.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── How it works (interactive stepper) ───────────────────────────────────────
const STEPS = [
  { tag: "Upload", title: "Upload both codebases", desc: "Supply the legacy program and its migrated counterpart, plus a black-box comparison contract — the inputs to generate and the output fields to diff." },
  { tag: "Generate", title: "Generate the inputs", desc: "Parity produces thousands of inputs spanning realistic ranges, plus boundary cases engineered to land on the edges where migrations break." },
  { tag: "Sandbox", title: "Run both in a sandbox", desc: "Each side executes in an isolated sandbox — no network egress, capped memory and wall-time, ephemeral filesystem. Uploaded code never runs in the web layer." },
  { tag: "Compare", title: "Diff every field", desc: "Every output field of every case is compared against the oracle to the cent, with non-deterministic fields masked. Each comparison is recorded." },
  { tag: "Explain", title: "Localize & explain", desc: "Divergence is pinned to the exact field and module. An LLM reads representative cases and names the root cause with a concrete suggested fix." },
  { tag: "Certify", title: "Issue the verdict", desc: "CERTIFIED if nothing diverges, NOT CERTIFIED if anything does — with the full evidence chain queryable in the Aurora ledger." },
];

function HowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();

  useEffect(() => {
    if (reduce || paused || !inView) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 3000);
    return () => clearInterval(id);
  }, [reduce, paused, inView]);

  return (
    <section style={{ borderTop: `1px solid ${c.rule}`, background: c.paper }}>
      <div ref={ref} style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 32px" }}>
        <Reveal>
          <div style={eyebrow}>How it works</div>
          <h2 style={h2}>Six stages, one verdict.</h2>
          <p style={{ fontSize: 16, lineHeight: "26px", color: c.muted, marginTop: 12, maxWidth: 560 }}>
            The pipeline that turns two codebases into a signed result. Hover to pause; click a stage to inspect it.
          </p>
        </Reveal>

        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={{ marginTop: 32, display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 28, alignItems: "start" }}
        >
          {/* step list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.tag}
                  onClick={() => setActive(i)}
                  aria-current={on}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "13px 16px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: `1px solid ${on ? c.instrument : c.rule}`,
                    background: on ? c.surface : "transparent",
                    boxShadow: on ? "0 1px 3px rgba(31,95,122,.12)" : "none",
                    transition: "all .2s ease",
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 26,
                      height: 26,
                      borderRadius: 5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: font.mono,
                      fontSize: 12,
                      fontWeight: 600,
                      color: on ? c.paper : c.muted,
                      background: on ? c.ink : c.divider,
                      transition: "all .2s ease",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: on ? c.ink : c.inkSoft }}>{s.title}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: on ? c.instrument : c.muted2 }}>{s.tag}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* active detail + per-step graphic */}
          <div style={{ background: c.surface, border: `1px solid ${c.rule}`, borderRadius: 8, padding: "26px 28px", minHeight: 320, boxShadow: "0 1px 3px rgba(15,26,42,.06)", display: "flex", flexDirection: "column" }}>
            <StepGraphic step={active} />
            <div key={active} style={{ marginTop: 22, animation: reduce ? "none" : "paRise 320ms ease both" }}>
              <div style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c.instrument }}>
                Stage {active + 1} · {STEPS[active].tag}
              </div>
              <h3 style={{ fontFamily: font.serif, fontWeight: 500, fontSize: 24, color: c.ink, margin: "8px 0 0" }}>{STEPS[active].title}</h3>
              <p style={{ fontSize: 15, lineHeight: "24px", color: c.muted, marginTop: 10 }}>{STEPS[active].desc}</p>
            </div>
            {/* progress dots */}
            <div style={{ marginTop: "auto", paddingTop: 22, display: "flex", gap: 6 }}>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  style={{
                    height: 4,
                    flex: 1,
                    borderRadius: 2,
                    background: i === active ? c.instrument : c.divider,
                    transition: "background .25s ease",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Lightweight themed graphic per pipeline stage.
function StepGraphic({ step }: { step: number }) {
  const box: React.CSSProperties = { height: 150, borderRadius: 6, background: c.paper, border: `1px solid ${c.rule}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" };
  const mono = (s: string, color: string = c.inkSoft, size = 13): React.CSSProperties => ({ fontFamily: font.mono, fontSize: size, color });

  if (step === 0)
    return (
      <div style={box}>
        <div style={{ display: "flex", gap: 18 }}>
          {["legacy.cbl", "migrated.py"].map((f, i) => (
            <div key={f} style={{ width: 96, height: 100, border: `1.5px dashed ${i ? c.instrument : c.dashBorder}`, borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, background: i ? "rgba(31,95,122,.05)" : "transparent" }}>
              <span style={{ fontSize: 22 }}>↥</span>
              <span style={mono(f, i ? c.instrument : c.muted, 11)}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div style={box}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, padding: "0 24px" }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 2, background: i % 11 === 7 ? c.amber : c.instrument, opacity: i % 11 === 7 ? 1 : 0.35 }} />
          ))}
        </div>
      </div>
    );
  if (step === 2)
    return (
      <div style={box}>
        <div style={{ display: "flex", gap: 16 }}>
          {["legacy", "migrated"].map((s) => (
            <div key={s} style={{ width: 120, padding: "14px 0", border: `1px solid ${c.rule}`, borderRadius: 6, textAlign: "center", background: c.surface }}>
              <div style={{ fontSize: 20 }}>⛨</div>
              <div style={mono(s, c.inkSoft, 12)}>{s}</div>
              <div style={mono("sandbox", c.muted2, 10)}>no network · capped</div>
            </div>
          ))}
        </div>
      </div>
    );
  if (step === 3)
    return (
      <div style={box}>
        <div style={{ width: "100%", padding: "0 28px", display: "flex", flexDirection: "column", gap: 9 }}>
          {[["$4,736.74", "=", "$4,736.74", false], ["$6,145.71", "≠", "$6,145.70", true], ["$2,010.14", "=", "$2,010.14", false]].map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", alignItems: "center" }}>
              <span style={{ ...mono(String(r[0]), c.ink, 14), textAlign: "right" }}>{r[0] as string}</span>
              <span style={{ ...mono(String(r[1]), r[3] ? c.divergent : c.verified, 14), textAlign: "center", fontWeight: 600 }}>{r[1] as string}</span>
              <span style={{ ...mono(String(r[2]), c.ink, 14), textAlign: "left" }}>{r[2] as string}</span>
            </div>
          ))}
        </div>
      </div>
    );
  if (step === 4)
    return (
      <div style={box}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: font.mono, fontSize: 12, color: c.divergent, border: "1px solid rgba(179,38,30,.4)", background: "rgba(179,38,30,.05)", borderRadius: 4, padding: "5px 11px" }}>
            final_amount · interest_calc
          </div>
          <div style={{ fontSize: 13, color: c.muted, marginTop: 14, maxWidth: 240, lineHeight: "20px" }}>
            “Float arithmetic with banker&apos;s rounding vs the oracle&apos;s round-half-away-from-zero.”
          </div>
        </div>
      </div>
    );
  return (
    <div style={{ ...box, background: c.ink, border: `1px solid ${c.sealRule}` }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: font.serif, fontSize: 30, color: c.divergentLt, fontWeight: 500 }}>NOT CERTIFIED</div>
        <div style={{ fontFamily: font.mono, fontSize: 11, color: c.sealMuted, marginTop: 6 }}>1 field diverges · 312 / 10,000</div>
      </div>
    </div>
  );
}

// ── Verdict seal (scroll-stamped + interactive toggle) ────────────────────────
function SealSection() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduce = useReducedMotion();
  const [pass, setPass] = useState(false);

  const word = pass ? "CERTIFIED" : "NOT CERTIFIED";
  const wordColor = pass ? c.verifiedLt : c.divergentLt;
  const summary = pass
    ? "Every field matches the oracle across all 10,000 inputs. The migration behaves identically."
    : "1 field diverges on 312 of 10,000 inputs (3.1%). The migration is not certified.";

  return (
    <section style={{ borderTop: `1px solid ${c.rule}`, background: c.surface }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "76px 32px", textAlign: "center" }}>
        <Reveal>
          <div style={eyebrow}>The verdict</div>
          <h2 style={{ ...h2, textAlign: "center" }}>A result an auditor can sign.</h2>
          <p style={{ fontSize: 16, lineHeight: "26px", color: c.muted, margin: "12px auto 0", maxWidth: 540 }}>
            Not a toast that disappears — a stamped certificate of conformance, backed by every comparison
            in the ledger.
          </p>
        </Reveal>

        <div ref={ref} style={{ marginTop: 36 }}>
          <div
            key={`${pass}-${inView}`}
            style={{
              position: "relative",
              overflow: "hidden",
              background: c.ink,
              borderRadius: 10,
              boxShadow: "0 16px 44px rgba(15,26,42,.26)",
              padding: "40px 40px 34px",
              textAlign: "left",
              animation: inView && !reduce ? "paStamp 360ms cubic-bezier(.2,.8,.25,1) both" : "none",
            }}
          >
            <div aria-hidden style={{ position: "absolute", right: -14, top: -40, fontFamily: font.serif, fontSize: 260, lineHeight: 1, color: "rgba(255,255,255,.035)", fontWeight: 500, pointerEvents: "none" }}>
              {pass ? "=" : "≠"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
              <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: c.sealMuted }}>Certificate of verification</span>
              <span style={{ fontFamily: font.mono, fontSize: 12, color: c.sealMuted }}>run_8f3a2c</span>
            </div>
            <div style={{ fontFamily: font.serif, fontWeight: 500, fontSize: 48, lineHeight: 1, color: wordColor, marginTop: 18, position: "relative" }}>{word}</div>
            <div style={{ fontSize: 15, lineHeight: "23px", color: c.sealText, marginTop: 12, maxWidth: 560, position: "relative" }}>{summary}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18, marginTop: 26, paddingTop: 22, borderTop: `1px solid ${c.sealRule}`, position: "relative" }}>
              <SealStat label="Inputs verified" value="10,000" />
              <SealStat label="Fields checked" value="2" />
              <SealStat label="Findings" value={pass ? "0" : "1"} color={wordColor} />
              <SealStat label="Coverage" value="100%" />
            </div>
          </div>

          {/* interactive toggle (user control: see both outcomes) */}
          <div style={{ marginTop: 18, display: "inline-flex", gap: 0, border: `1px solid ${c.rule}`, borderRadius: 6, overflow: "hidden" }}>
            <ToggleBtn on={!pass} onClick={() => setPass(false)} label="A failed run" />
            <ToggleBtn on={pass} onClick={() => setPass(true)} label="A clean run" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ToggleBtn({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        fontFamily: font.sans,
        fontSize: 13,
        fontWeight: 600,
        padding: "9px 18px",
        cursor: "pointer",
        border: "none",
        background: on ? c.ink : c.surface,
        color: on ? c.paper : c.muted,
        transition: "all .15s ease",
      }}
    >
      {label}
    </button>
  );
}

// ── Live ledger ───────────────────────────────────────────────────────────────
function Ledger() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const inputs = useCountUp(10000, inView);
  const comparisons = useCountUp(20000, inView);
  const fields = useCountUp(2, inView, 900);
  const diffs = useCountUp(312, inView);

  const rows = [
    ["1043", "$3,950.40 · 3.75% · 12", "$6,145.71", "≠", "$6,145.70", "−$0.01"],
    ["2271", "$6,240.80 · 4.20% · 18", "$13,088.45", "≠", "$13,088.44", "−$0.01"],
    ["1102", "$3,200.00 · 4.00% · 10", "$4,736.74", "=", "$4,736.74", "$0.00"],
    ["3508", "$1,820.00 · 5.50% · 9", "$2,946.94", "≠", "$2,946.93", "−$0.01"],
  ];

  return (
    <section ref={ref} style={{ borderTop: `1px solid ${c.rule}`, background: c.paper }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 32px" }}>
        <Reveal>
          <div style={eyebrow}>The ledger</div>
          <h2 style={h2}>Every verdict is backed by evidence.</h2>
          <p style={{ fontSize: 16, lineHeight: "26px", color: c.muted, marginTop: 12, maxWidth: 580 }}>
            Each input, each execution, each field comparison is a queryable record in Amazon Aurora. Drill
            from any verdict to the exact case that caused it. Analytics are live SQL over the ledger — never
            computed and thrown away.
          </p>
        </Reveal>

        <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          <LedgerStat label="Inputs verified" value={Math.round(inputs).toLocaleString("en-US")} />
          <LedgerStat label="Field comparisons" value={Math.round(comparisons).toLocaleString("en-US")} />
          <LedgerStat label="Fields checked" value={Math.round(fields).toString()} />
          <LedgerStat label="Divergences" value={Math.round(diffs).toLocaleString("en-US")} color={c.divergent} />
        </div>

        <Reveal delay={120} style={{ marginTop: 18 }}>
          <div style={{ background: c.surface, border: `1px solid ${c.rule}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,26,42,.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: `1px solid ${c.rule}`, background: c.raised }}>
              <span style={{ fontWeight: 600, fontSize: 12.5, color: c.ink }}>field_diffs · run_8f3a2c</span>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.muted2, letterSpacing: ".04em" }}>LIVE SQL</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 130px 28px 130px 80px", gap: 12, padding: "10px 20px", background: c.surface, borderBottom: `1px solid ${c.divider}`, fontWeight: 600, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted }}>
              <div>Seq</div>
              <div>Inputs</div>
              <div style={{ textAlign: "right" }}>Legacy</div>
              <div />
              <div style={{ textAlign: "right" }}>Migrated</div>
              <div style={{ textAlign: "right" }}>Δ</div>
            </div>
            {rows.map((r) => {
              const div = r[3] === "≠";
              return (
                <div key={r[0]} style={{ display: "grid", gridTemplateColumns: "70px 1fr 130px 28px 130px 80px", gap: 12, padding: "11px 20px", borderBottom: `1px solid ${c.divider}`, alignItems: "center", borderLeft: `2px solid ${div ? c.divergent : "transparent"}` }}>
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: c.muted }}>{r[0]}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 13, color: c.inkSoft }}>{r[1]}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 14, color: c.ink, textAlign: "right" }}>{r[2]}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 14, color: div ? c.divergent : c.verified, textAlign: "center" }}>{r[3]}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 14, color: c.ink, textAlign: "right" }}>{r[4]}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 14, color: div ? c.divergent : c.muted2, textAlign: "right" }}>{r[5]}</div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Independence / sandbox ────────────────────────────────────────────────────
function Independence() {
  const items = [
    { glyph: "⊘", title: "Independent by construction", body: "Parity didn't write the migration, so its verdict is a neutral check — not the same tool grading its own homework. The legacy program is always the oracle." },
    { glyph: "⛨", title: "Sandboxed execution", body: "Uploaded code is untrusted. Every program runs in an isolated sandbox — no network egress, capped memory and wall-time, ephemeral disk, no access to other projects or to Parity's credentials." },
    { glyph: "▤", title: "Immutable evidence", body: "Runs and certifications are append-only. Re-verifying a fix creates a new run; nothing about a past verdict is ever edited. The audit trail holds." },
  ];
  return (
    <section style={{ borderTop: `1px solid ${c.rule}`, background: c.surface }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 32px" }}>
        <Reveal>
          <div style={eyebrow}>Why it&apos;s trustworthy</div>
          <h2 style={h2}>Built to be relied on.</h2>
        </Reveal>
        <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 90}>
              <div style={{ background: c.paper, border: `1px solid ${c.rule}`, borderRadius: 8, padding: "24px 24px", height: "100%" }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: c.ink, color: c.accentLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontFamily: font.mono }}>{it.glyph}</div>
                <div style={{ fontWeight: 600, fontSize: 16, color: c.ink, marginTop: 16 }}>{it.title}</div>
                <p style={{ fontSize: 14, lineHeight: "22px", color: c.muted, marginTop: 8 }}>{it.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section style={{ background: c.ink }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
        <h2 style={{ fontFamily: font.serif, fontWeight: 500, fontSize: 38, lineHeight: "44px", color: c.paper, margin: 0 }}>
          Verify your first migration.
        </h2>
        <p style={{ fontSize: 16, lineHeight: "26px", color: c.sealText, margin: "16px auto 0", maxWidth: 480 }}>
          Start with the built-in COBOL example — one click to a known-divergent run — or upload your own pair.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 30, flexWrap: "wrap" }}>
          <Link href="/verify/new" style={{ ...btnPrimary, background: c.paper, color: c.ink, border: `1px solid ${c.paper}` }}>
            Run the live demo
          </Link>
          <Link href="/projects" style={{ ...btnGhost, background: "transparent", color: c.paper, border: `1px solid ${c.sealRule}` }}>
            Explore the ledger →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: c.ink, borderTop: `1px solid ${c.sealRule}` }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "22px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 22, height: 22, borderRadius: 5, background: c.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, color: c.accentLt, fontSize: 13, fontWeight: 600 }}>=</span>
          <span style={{ color: c.sealText, fontSize: 13 }}>Parity — independent verification for code migrations</span>
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.sealMuted }}>Aurora ledger · sandboxed execution · signed verdicts</span>
      </div>
    </footer>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────────
function SealStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: ".07em", textTransform: "uppercase", color: c.sealMuted }}>{label}</div>
      <div style={{ fontFamily: font.mono, fontSize: 18, color: color ?? c.paper, marginTop: 5 }}>{value}</div>
    </div>
  );
}
function LedgerStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.rule}`, borderRadius: 8, padding: "18px 20px" }}>
      <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c.muted }}>{label}</div>
      <div style={{ fontFamily: font.mono, fontSize: 26, fontWeight: 500, color: color ?? c.ink, marginTop: 6 }}>{value}</div>
    </div>
  );
}

const chip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontFamily: font.mono,
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: c.instrument,
  background: "rgba(31,95,122,.08)",
  border: `1px solid rgba(31,95,122,.2)`,
  borderRadius: 20,
  padding: "6px 13px",
};
const eyebrow: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 12,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: c.muted,
};
const h2: React.CSSProperties = {
  fontFamily: font.serif,
  fontWeight: 500,
  fontSize: 32,
  lineHeight: "38px",
  color: c.ink,
  margin: "8px 0 0",
  letterSpacing: "-.01em",
};
const btnPrimary: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 600,
  fontSize: 15,
  color: c.paper,
  background: c.ink,
  border: `1px solid ${c.ink}`,
  borderRadius: 6,
  padding: "13px 24px",
  cursor: "pointer",
  display: "inline-block",
};
const btnGhost: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 600,
  fontSize: 15,
  color: c.ink,
  background: c.surface,
  border: `1px solid ${c.dashBorder}`,
  borderRadius: 6,
  padding: "13px 24px",
  cursor: "pointer",
  display: "inline-block",
};
