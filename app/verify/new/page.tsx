"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { c, font } from "@/lib/tokens";

type Slot = { files: File[]; lang: string };

export default function NewVerification() {
  const router = useRouter();
  const [configOpen, setConfigOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [legacy, setLegacy] = useState<Slot>({ files: [], lang: "COBOL" });
  const [migrated, setMigrated] = useState<Slot>({ files: [], lang: "Python" });

  const [inputSchema, setInputSchema] = useState("seq,principal,rate,term,gross,tax_rate");
  const [outputFields, setOutputFields] = useState("final_amount,net_pay");
  const [legacyCmd, setLegacyCmd] = useState("cobc -x -free -o legacy legacy.cbl && ./legacy");
  const [migratedCmd, setMigratedCmd] = useState("python3 migrated.py inputs.csv migrated_outputs.csv");

  const bothUploaded = legacy.files.length > 0 && migrated.files.length > 0;

  const startUpload = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', `${legacy.lang} → ${migrated.lang} Migration`);
      formData.append('sourceLanguage', legacy.lang);
      formData.append('targetLanguage', migrated.lang);
      formData.append('legacyCmd', legacyCmd);
      formData.append('migratedCmd', migratedCmd);
      formData.append('outputFields', outputFields);
      for (const file of legacy.files) formData.append('legacyFiles', file);
      for (const file of migrated.files) formData.append('migratedFiles', file);

      const { projectId } = await fetch('/api/projects', { method: 'POST', body: formData }).then((r) => r.json());
      const { runId } = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      }).then((r) => r.json());
      router.push(`/runs/${runId}?running=1`);
    } catch {
      setError('Could not start verification. Check that the files and commands are correct.');
      setBusy(false);
    }
  };

  const startDemo = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { projectId } = await fetch("/api/projects/demo", { method: "POST" }).then((r) => r.json());
      const { runId } = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }).then((r) => r.json());
      router.push(`/runs/${runId}?running=1`);
    } catch {
      setError("Could not start verification. Is the database reachable?");
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "44px 32px 80px" }}>
      <Link href="/projects" style={backLink}>
        ← Projects
      </Link>
      <div style={eyebrow}>New verification</div>
      <h1 style={{ ...title, margin: "6px 0 4px" }}>Verify a migration</h1>
      <p style={{ fontSize: 15, lineHeight: "24px", color: c.muted, margin: "0 0 28px", maxWidth: 560 }}>
        Upload the legacy codebase and its migrated counterpart. Parity runs both in an isolated
        sandbox against the same generated inputs, compares them field by field, and issues a verdict
        you can put your name on.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(179,38,30,.06)", border: `1px solid rgba(179,38,30,.3)`, borderRadius: 6, fontFamily: font.mono, fontSize: 13, color: c.divergent }}>
          {error}
        </div>
      )}

      {/* built-in example */}
      <button onClick={startDemo} disabled={busy} className="card-upload" style={{ ...exampleCard, opacity: busy ? 0.7 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 16, color: c.ink }}>
                {busy ? "Starting…" : "Use the built-in example"}
              </span>
              <span style={recoBadge}>Recommended</span>
            </div>
            <div style={{ fontSize: 13.5, color: c.muted, marginTop: 5 }}>
              COBOL Interest &amp; Payroll · one click to a known-divergent demo. No code to supply.
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 12.5, color: c.inkSoft, marginTop: 9 }}>
              COBOL → Python · 10,000 inputs · exact tolerance
            </div>
          </div>
          <div style={arrowChip}>→</div>
        </div>
      </button>

      {/* OR */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0" }}>
        <div style={{ flex: 1, height: 1, background: c.rule }} />
        <span style={{ fontFamily: font.mono, fontSize: 11, color: c.muted2, letterSpacing: ".05em" }}>OR</span>
        <div style={{ flex: 1, height: 1, background: c.rule }} />
      </div>

      {/* upload your own */}
      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 16, color: c.ink }}>Upload your own</div>
        <div style={{ fontSize: 13.5, color: c.muted, marginTop: 4 }}>
          Supply the legacy program and its migrated counterpart. Add multiple files or an archive for
          a whole codebase.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 18 }}>
          <UploadSlot
            title="Legacy codebase (oracle)"
            ext=".cbl / .pli · or .zip"
            langs={["COBOL", "PL/I", "FORTRAN", "RPG"]}
            slot={legacy}
            onFiles={(files) => setLegacy((s) => ({ ...s, files }))}
            onLang={(lang) => setLegacy((s) => ({ ...s, lang }))}
          />
          <UploadSlot
            title="Migrated codebase"
            ext=".py / .java / .go · or .zip"
            langs={["Python", "Java", "Go", "C#", "TypeScript"]}
            slot={migrated}
            onFiles={(files) => setMigrated((s) => ({ ...s, files }))}
            onLang={(lang) => setMigrated((s) => ({ ...s, lang }))}
          />
        </div>

        {!bothUploaded && (
          <div style={warnRow}>
            <span style={{ fontFamily: font.mono }}>!</span>
            {legacy.files.length === 0 && migrated.files.length === 0
              ? "Add both the legacy and migrated programs to continue."
              : legacy.files.length === 0
                ? "Add the legacy program to continue."
                : "Add the migrated program to continue."}
          </div>
        )}

        {/* I/O contract */}
        <div style={{ marginTop: 20, borderTop: `1px solid ${c.divider}`, paddingTop: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: c.ink }}>Comparison contract</div>
          <div style={{ fontSize: 12.5, color: c.muted, marginTop: 3 }}>
            How Parity drives both programs and reads their results. Black-box: each program reads the
            same inputs and writes the output fields below.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
            <Field label="Input schema" hint="Comma-separated input fields generated for both sides.">
              <input value={inputSchema} onChange={(e) => setInputSchema(e.target.value)} style={input} />
            </Field>
            <Field label="Compared output fields" hint="Fields diffed against the oracle, in order.">
              <input value={outputFields} onChange={(e) => setOutputFields(e.target.value)} style={input} />
            </Field>
            <Field label="Legacy run command" hint="Executed inside the legacy sandbox.">
              <input value={legacyCmd} onChange={(e) => setLegacyCmd(e.target.value)} style={input} />
            </Field>
            <Field label="Migrated run command" hint="Executed inside the migrated sandbox.">
              <input value={migratedCmd} onChange={(e) => setMigratedCmd(e.target.value)} style={input} />
            </Field>
          </div>
        </div>

        {/* sandbox note */}
        <div style={sandboxNote}>
          <span style={{ fontFamily: font.mono, fontWeight: 600 }}>⛨</span>
          <span>
            Both programs run in an isolated sandbox — no network egress, memory and wall-time capped,
            filesystem ephemeral. Parity never executes uploaded code in the web layer.
          </span>
        </div>
      </div>

      {/* configuration */}
      <div style={{ ...card, padding: 0, marginTop: 20, overflow: "hidden" }}>
        <button onClick={() => setConfigOpen((o) => !o)} style={configToggle}>
          <span style={{ fontWeight: 600, fontSize: 14, color: c.ink }}>Configuration</span>
          <span style={{ fontFamily: font.mono, fontSize: 12.5, color: c.muted }}>
            {configOpen ? "Hide" : "10,000 inputs · exact"}
          </span>
        </button>
        {configOpen && (
          <div style={{ padding: "4px 24px 22px", borderTop: `1px solid ${c.divider}` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 18 }}>
              <Field label="Input count" hint="Generated inputs, plus boundary cases for rounding.">
                <input defaultValue="10,000" style={input} />
              </Field>
              <Field label="Equivalence tolerance" hint="Differences within tolerance count as matches.">
                <select style={{ ...input, background: c.surface }} defaultValue="Exact — to the cent">
                  <option>Exact — to the cent</option>
                  <option>± 0.01</option>
                  <option>± 0.05</option>
                </select>
              </Field>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={bothUploaded ? startUpload : startDemo}
          disabled={busy}
          className={bothUploaded ? "btn-dark" : undefined}
          style={{ ...runBtn, opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Starting…" : "Run verification"}
        </button>
        <span style={{ fontSize: 13, color: c.muted }}>
          {bothUploaded
            ? `Runs ${legacy.lang} → ${migrated.lang} in the sandbox with current defaults.`
            : "Runs the built-in example with current defaults."}
        </span>
      </div>
    </div>
  );
}

function UploadSlot({
  title,
  ext,
  langs,
  slot,
  onFiles,
  onLang,
}: {
  title: string;
  ext: string;
  langs: string[];
  slot: Slot;
  onFiles: (files: File[]) => void;
  onLang: (lang: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const has = slot.files.length > 0;

  const summary =
    slot.files.length === 0
      ? null
      : slot.files.length === 1
        ? slot.files[0].name
        : `${slot.files.length} files`;

  return (
    <div>
      <div style={fieldLabel}>{title}</div>
      <input
        ref={ref}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFiles(Array.from(e.dataTransfer.files));
        }}
        style={{
          height: 96,
          border: `1.5px ${has ? "solid" : "dashed"} ${has ? c.instrument : drag ? c.instrument : c.dashBorder}`,
          borderRadius: 6,
          background: has
            ? "rgba(31,95,122,.05)"
            : "repeating-linear-gradient(135deg,#F8F8F5,#F8F8F5 8px,#F2F2EC 8px,#F2F2EC 16px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          fontFamily: font.mono,
          fontSize: 12,
          color: has ? c.instrument : c.muted2,
          textAlign: "center",
          padding: "0 12px",
          cursor: "pointer",
        }}
      >
        {has ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.ink, wordBreak: "break-all" }}>{summary}</span>
            <span style={{ fontSize: 11, color: c.instrument }}>Replace</span>
          </>
        ) : (
          <>
            <span>drop files or click</span>
            <span>{ext}</span>
          </>
        )}
      </div>
      <select
        value={slot.lang}
        onChange={(e) => onLang(e.target.value)}
        style={{ ...input, marginTop: 8, fontSize: 13, padding: "8px 10px", background: c.surface }}
      >
        {langs.map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: c.muted, marginTop: 6 }}>{hint}</div>}
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
};
const backLink: React.CSSProperties = {
  fontFamily: font.sans,
  fontSize: 13,
  fontWeight: 500,
  color: c.instrument,
  display: "inline-block",
  marginBottom: 20,
};
const card: React.CSSProperties = {
  background: c.surface,
  border: `1px solid ${c.rule}`,
  borderRadius: 6,
  padding: "22px 24px",
  boxShadow: "0 1px 3px rgba(15,26,42,.06)",
};
const exampleCard: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: c.surface,
  border: `1.5px solid ${c.instrument}`,
  borderRadius: 6,
  padding: "22px 24px",
  cursor: "pointer",
  boxShadow: "0 1px 3px rgba(15,26,42,.06)",
};
const recoBadge: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: ".05em",
  textTransform: "uppercase",
  color: c.instrument,
  background: "rgba(31,95,122,.1)",
  borderRadius: 4,
  padding: "2px 7px",
};
const arrowChip: React.CSSProperties = {
  flex: "none",
  width: 38,
  height: 38,
  borderRadius: 6,
  background: c.ink,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: c.paper,
  fontSize: 18,
};
const fieldLabel: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: c.muted,
  marginBottom: 8,
};
const input: React.CSSProperties = {
  width: "100%",
  fontFamily: font.mono,
  fontSize: 13.5,
  color: c.ink,
  border: `1px solid ${c.rule}`,
  borderRadius: 4,
  padding: "9px 11px",
};
const warnRow: React.CSSProperties = {
  fontFamily: font.sans,
  fontSize: 12.5,
  color: c.amber,
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 7,
};
const sandboxNote: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  background: c.raised,
  border: `1px solid ${c.divider}`,
  borderRadius: 6,
  padding: "11px 13px",
  fontSize: 12.5,
  lineHeight: "19px",
  color: c.muted,
};
const configToggle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "none",
  border: "none",
  padding: "16px 24px",
  cursor: "pointer",
};
const runBtn: React.CSSProperties = {
  fontFamily: font.sans,
  fontWeight: 600,
  fontSize: 15,
  color: c.paper,
  background: c.ink,
  border: `1px solid ${c.ink}`,
  borderRadius: 6,
  padding: "13px 26px",
  cursor: "pointer",
};
