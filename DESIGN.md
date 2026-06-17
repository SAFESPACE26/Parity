# Parity — Design Specification (UI/UX)

This document defines the visual and interaction design for Parity. It is the companion to the functional spec: this describes how the product looks and feels; the functional spec describes how it behaves.

---

## 1. Design thesis

Parity is a **forensic instrument that issues a verdict**. Everything in the interface serves one act: letting a risk or audit professional trust a CERTIFIED / NOT CERTIFIED result about whether migrated code behaves identically to the original. The design should feel like the meeting point of two worlds — the **gravity of an audit certificate** and the **precision of an engineering diff tool**. Calm, exact, and trustworthy; never playful, never alarmist, never a generic SaaS dashboard.

Two principles carry the identity:

**Comparison is the product.** The core act is holding two things side by side and judging them equal or not. The side-by-side diff is therefore the signature motif, not a feature buried in one screen.

**Exact values are sacred.** This product exists because a half-cent matters. Monospaced numerals are elevated to a first-class identity element — every value, delta, and field is set in mono, because precision is the brand.

## 2. Subject grounding

- **Who it's for:** risk/audit officers and engineering leaders at banks, insurers, and government agencies, and the systems integrators running their modernization programs. Sophisticated, skeptical, table-literate, accountable for the verdict.
- **The single job of the product:** make an auditor confident enough in a pass/fail result to put their name on it.
- **The world it draws from:** mainframes, COBOL, ledgers, certificates of conformance, forensic comparison, financial precision. The aesthetic is derived from this world rather than imported from dashboard conventions.

## 3. Token system

### Color

A "forensic ledger" palette: an ink chrome around a calm paper working surface, with a single decisive verdict axis (verified green vs divergence red). Deliberately avoids the common AI-design defaults (cream + high-contrast serif + terracotta; near-black + acid accent; broadsheet hairlines).

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#0F1A2A` | Deep slate-navy. App chrome, headers, the certificate seal field, dark surfaces. |
| `--ink-soft` | `#1C2A3D` | Raised dark surfaces, nav, code gutters. |
| `--paper` | `#F4F5F2` | Primary working surface (cool bone, not cream). |
| `--surface` | `#FFFFFF` | Cards, tables, the reading plane. |
| `--rule` | `#D9D9D2` | Hairlines, table borders, dividers. |
| `--muted` | `#5B6470` | Secondary text, captions, labels. |
| `--verified` | `#167C5B` | CERTIFIED, matches, success. Deep evergreen — serious, not neon. |
| `--divergent` | `#B3261E` | NOT CERTIFIED, divergences, critical findings. Controlled signal red. |
| `--amber` | `#B26B00` | Medium severity, warnings, in-tolerance variance. |
| `--instrument` | `#1F5F7A` | Interactive accent: links, selected state, focus. Steel teal. |

Usage discipline: the verdict colors (`--verified`, `--divergent`) are reserved for verdict and divergence semantics only — never decorative. On any given screen, color should be earned by meaning.

### Typography

The type system is the strongest expression of the subject. The **IBM Plex** family anchors it because its lineage is the mainframe/enterprise world Parity operates in — a justified choice, not a default.

- **Display / verdict — `Spectral` (serif).** Used sparingly and only where the product speaks with authority: the verdict word, report titles, the certificate. A refined serif gives the certificate gravitas. Never used for UI chrome.
- **UI / body — `IBM Plex Sans`.** All interface text, navigation, labels, prose. Clean, institutional, legible at small sizes in dense tables.
- **Values / diffs / code — `IBM Plex Mono`.** Every numeric value, field name, delta, input, and code snippet. This is the identity element: the product's precision made visible. Tabular figures on, so columns of numbers align.

Type scale (sentence case throughout):

| Step | Size / line | Face / weight | Use |
|---|---|---|---|
| Display | 44 / 48 | Spectral 500 | The verdict word, report hero |
| Title | 28 / 34 | Spectral 500 | Page titles |
| H2 | 20 / 28 | Plex Sans 600 | Section headers |
| Body | 15 / 24 | Plex Sans 400 | Prose, descriptions |
| Label | 12 / 16, +6% tracking, uppercase | Plex Sans 600 | Eyebrows, table headers, field labels |
| Value | 14 / 20 | Plex Mono 500, tabular | All numbers, fields, deltas |
| Code | 13 / 22 | Plex Mono 400 | Program source, raw output |

### Space, radius, elevation

- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Generous whitespace; let the tables breathe.
- **Radius:** small and consistent — `6px` on cards and controls, `4px` on pills and inputs. Not pill-rounded (that reads consumer); not zero (that reads broadsheet cliché). One restrained radius.
- **Elevation:** flat by default. One soft shadow level for raised cards (`0 1px 3px rgba(15,26,42,.08)`). The verdict banner and certificate may use a slightly deeper shadow to lift them. No glows, no gradients except a single optional faint paper texture on the ink seal field.

## 4. Signature elements

Three elements make Parity recognizable and should be designed with care; everything else stays quiet.

**The equivalence spine.** The diff is rendered as two aligned columns — `LEGACY` (the oracle) on the left, `MIGRATED` on the right — separated by a thin center spine. Where values match, the spine is a calm hairline with a small `=`. Where they diverge, the spine breaks: a short offset, a `≠`, the delta surfaced in `--divergent`, and the two values set so the differing characters are emphasized. This motif appears in the diff explorer and as a compact unit inside findings.

**The verdict seal.** The result is presented as a formal stamp, not a toast. On an ink field, the verdict word is set in Spectral — `CERTIFIED` in `--verified`, `NOT CERTIFIED` in `--divergent` — framed like a certificate of conformance, with run id, input count, fields checked, and issue timestamp set in mono beneath. It should feel like a document an auditor could print and sign.

**The live ledger.** The Aurora ledger is shown as a visible, queryable artifact — dense mono tables and SQL-backed charts that are obviously *real records*, reinforcing that every verdict is backed by evidence. The ledger doing visible work is part of the brand, not just a data view.

## 5. Voice and copy

Copy is design material. Plain verbs, sentence case, no filler, written from the user's side of the screen.

- Name things by what the user controls and recognizes: "Run verification," "Findings," "Evidence," not system internals.
- Actions keep their name through the flow: the button says **Run verification**; the resulting state says **Verifying**; the record says **Verified**.
- Verdicts are stated, never softened: "Migration not certified — 1 field diverges." No apologies, no exclamation.
- Failure and emptiness give direction. Empty diff explorer (no mismatches): "No divergences in this field. Every input matched the oracle." A failed run: "Verification could not finish — the migrated program errored on 3 inputs. View details." Errors explain what happened and the next step, in the interface's voice.
- Numbers always carry a unit or anchor: "diverges on 312 of 10,000 inputs (3.1%)," not a bare "312."

## 6. Screen-by-screen UX

### 6.1 Projects dashboard (`/`)

The home and the audit overview. A calm list, not a tile grid.

- **Header:** product wordmark (Plex Sans, the dot of the "i" or a small `=` glyph as a mark), and a single primary action **New verification** (top right).
- **Body:** a ledger-style table of projects — name, source → target languages (mono), latest verdict (a verdict pill), divergence rate of the last run (mono), last run time. Rows are quiet; the verdict pill is the only color.
- **Verdict pill:** a small, bordered pill — `VERIFIED` in `--verified`, `NOT CERTIFIED` in `--divergent`, `—` muted if never run.
- **Empty state:** first-run invitation. A short line — "Verify your first migration. Start with the built-in COBOL example or upload your own." — and the New verification action. An invitation to act, not a blank page.
- **Interaction:** a row opens that project's latest run; a secondary affordance opens run history.

### 6.2 New verification (`/verify/new`)

A focused setup, not a multi-step wizard.

- **Two-path top choice:** a prominent card **Use the built-in example — COBOL Interest & Payroll** (recommended, one click to a known-divergent demo), and **Upload your own** (legacy file + migrated file, with language selectors).
- **Configuration (collapsed by default, sensible defaults shown):** input count (default 10,000) and equivalence tolerance (default Exact — "Compare every value to the cent"). Tolerance is explained in plain terms, not as a number field alone.
- **Primary action:** **Run verification.** On submit, create the run and route to the run page. The button shows an inline working state until the redirect.
- **Validation:** if a file pair is incomplete, the field states what's missing inline ("Add the migrated program to continue"). No modal errors.

### 6.3 Run page — verifying state (`/runs/[id]` while running)

The instrument at work. This is a chance for one disciplined orchestrated moment.

- **Live progress, not a spinner.** Show the pipeline as ordered stages with live counters in mono: inputs generated, legacy executed, migrated executed, fields compared. A slim progress bar tracks overall completion.
- **A restrained ticker:** the count of inputs compared climbs in real time; a small running tally of matches vs divergences appears as comparison proceeds — calm, monospaced, no confetti.
- **Honesty about masking:** a one-line note that non-deterministic fields (dates, sequence ids) are normalized before comparison — present because it is core to the method, stated quietly.
- **Polling:** the page polls run status; on completion it transitions to the report (a brief, deliberate transition into the verdict seal — see motion).

### 6.4 Run page — report state (`/runs/[id]` when complete)

The payload. The verdict is the hero; the evidence supports it.

- **Verdict seal (hero):** the stamped CERTIFIED / NOT CERTIFIED on the ink field, with run id, input count, fields checked, and timestamp in mono. For a fail, a one-line summary directly beneath: "1 field diverges on 312 of 10,000 inputs."
- **Summary band:** four mono stats — inputs verified, fields checked, diverging inputs, coverage. Quiet, aligned, scannable.
- **Findings:** a card per diverging field. Each shows the field name and module (mono), divergence rate and max delta (mono), a severity pill, a compact equivalence-spine sample (two or three diverging cases), and the LLM explanation and suggested fix in prose. The suggested fix is rendered as a clear, copyable code block.
- **Analytics (SQL-backed, labeled as live ledger queries):** divergence rate per field (bar), divergence across this project's runs (line — drift over time), and a coverage gauge. Charts use the palette's verdict colors only for verdict meaning.
- **Action:** **Open diff explorer** (to inspect all evidence) and **Re-verify** (e.g., after applying the fix). For a clean CERTIFIED run, the page is calm and confident — green seal, full coverage, no findings, with an "Open evidence" affordance so a pass is still auditable.

### 6.5 Diff explorer (`/runs/[id]/diffs`)

The evidence, queryable. This is where the ledger is most visibly real.

- **Controls:** a field filter (chips per output field) and an **only divergences** toggle (default on for a failed run, so the auditor lands on the problem).
- **The table:** mono rows — seq, the inputs that produced this case, the legacy value, the migrated value, the delta. Matching rows are quiet; divergent rows use the equivalence-spine treatment with the differing characters emphasized and the delta in `--divergent`.
- **Row detail:** expanding a row reveals the full input set and both complete outputs, so any verdict is traceable to its exact case. This is the "reconstruct the evidence chain" moment.
- **Empty (filtered to a clean field):** "No divergences in this field. Every input matched the oracle." Direction, not a dead end.

## 7. Component inventory

- **Verdict seal** — large (report hero) and inline pill (list/finding) variants.
- **Severity pill** — critical (`--divergent`), high, medium (`--amber`), low (`--muted`); bordered, mono label.
- **Equivalence spine** — the two-column match/diverge unit, in full (explorer) and compact (finding) sizes.
- **Stat** — mono value + uppercase label; used in summary bands.
- **Ledger table** — dense, hairline-ruled, mono values, tabular figures, sticky header, zebra-free (rules separate rows, not fills).
- **Stage progress** — ordered pipeline stages with live mono counters.
- **Chart frame** — consistent container labeling each chart as a live ledger query, restrained axes, verdict colors only where they mean verdict.
- **Finding card** — field + module, metrics, spine sample, explanation, copyable fix.

## 8. Motion

Restraint is the rule; one orchestrated moment earns its place.

- **Run completion → verdict:** a brief, deliberate settle as the seal stamps in (a short scale/opacity, ~250ms, eased). This is the emotional beat; make it land once, cleanly.
- **Diff reveal:** divergent rows settle in slightly after matching rows, drawing the eye to the break — subtle, not theatrical.
- **Ticker:** numeric counters tween as they climb during a run.
- **Everything else:** standard, quick, ~120–160ms hover/focus transitions. Respect `prefers-reduced-motion` — disable the stamp and reveals, keep state changes instant.

## 9. Accessibility and responsive floor

- Color is never the only signal: verdict and severity always pair color with a label and an icon/glyph (`=` / `≠`, check / break).
- Contrast meets WCAG AA against `--paper` and `--ink`; verify the verdict colors on both surfaces.
- Visible keyboard focus everywhere (`--instrument` ring); full keyboard operability of tables, filters, and row expansion.
- Tables degrade gracefully on narrow screens: the diff explorer collapses to stacked legacy/migrated pairs per case rather than horizontal scroll; the report stacks seal → stats → findings → charts.
- Mono tabular figures keep numeric columns aligned at every breakpoint.

## 10. What "good" looks like

A risk officer opens a completed run, reads a stamped verdict they immediately trust, sees exactly which field broke and why, drills into the precise inputs that caused it, and could defend the conclusion in a meeting — all in an interface that feels like a precision instrument built for their world, not a dashboard template. Spend the boldness on the seal, the spine, and the live ledger; keep everything else quiet and exact.
