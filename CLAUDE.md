# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

A **UI-only Next.js frontend** has been built on the `feature/frontend` branch (`app/`, `lib/tokens.ts`, `lib/mock.ts`) — all five screens, styled to `DESIGN.md` and the `Parity.dc.html` comp, driven by mock data in `lib/mock.ts`. There is **no backend yet**: no API routes, no Aurora, no worker, no sandbox. The upload UX and comparison-contract fields on `/verify/new` are functional inputs but every Run routes to the seeded demo run. When you build the backend, follow `Parity_Build_Prompt.md` top to bottom; it is the authoritative build contract (data model in §6 and acceptance criteria in §13 are non-negotiable).

Current files:
- `Parity_Build_Prompt.md` — complete build specification (architecture, schema, pipeline, API, screens, seed assets, milestones, acceptance criteria).
- `FUNCTIONAL.md` — functional spec (actors, requirements, user flows, run lifecycle state machine, business rules, edge cases).
- `DESIGN.md` — UI/UX spec (design thesis, token system, signature elements, screen-by-screen UX).
- `Parity.dc.html` + `support.js` — a **design comp**, not the app. It renders the full UI in a custom `<x-dc>` template runtime (`{{ }}` bindings, `<sc-if>`). `support.js` is a generated bundle (`// GENERATED from dc-runtime/src/*.ts`); do not edit it. Treat the HTML as the visual reference for the real Next.js build, not code to extend.
- `README.md` — empty.

## What Parity is

An independent verification layer for AI-generated legacy-code migrations. A reviewer uploads a legacy codebase and its migrated counterpart (or picks the built-in demo) and declares a **comparison contract**; Parity runs both inside an isolated **sandbox** against the same generated inputs, compares outputs field-by-field, localizes divergence, has an LLM explain it, records everything in a queryable **equivalence ledger** (Aurora PostgreSQL), and issues a **CERTIFIED / NOT_CERTIFIED** verdict. The product's value is the ledger and the verdict, not the test runner.

The v1 comparison contract is **black-box**: each program reads the same generated inputs (CSV) and writes named output fields that Parity diffs against the oracle. Function-level and HTTP-service contracts are future work. Uploaded code is untrusted — it runs only in the sandboxed worker (no network, capped memory/wall-time, ephemeral FS), never in the Next.js layer or at upload time.

The flagship demo ("COBOL Interest & Payroll") must be **deterministic**: a seeded rounding bug (COBOL `ROUNDED` = round-half-away-from-zero vs Python float banker's rounding) makes `final_amount` diverge by one cent on a fraction of 10,000 inputs, every run → NOT_CERTIFIED.

## Architecture (three components, communicating only through Aurora)

1. **Next.js app (Vercel, App Router + TypeScript)** — UI + API route handlers. Creates projects, enqueues runs (inserts a `verification_runs` row with status `queued`), and serves all ledger data back via SQL. Does **no heavy execution**.
2. **Verification worker (Node + TypeScript)** — long-running poll loop that claims queued runs, runs the 7-stage pipeline, shells out to `cobc`/`cobcrun` (GnuCOBOL) and `python3`, writes all evidence to Aurora, sets the verdict. Runs locally for the demo (`npm run worker`); deployable to AWS Fargate. Communicates with the app **only through Aurora** — a job row is the queue.
3. **Aurora PostgreSQL** — the equivalence ledger and the job queue.

**Hard constraints:** heavy verification must NOT run in a Vercel serverless function (it compiles/runs programs over thousands of inputs). Aurora is the only data store; all evidence lives there. Use parameterized queries.

Data flow: UI POST → `verification_runs` (`queued`) → worker claims (`running`) → worker writes `test_cases`, `legacy_runs`, `migrated_runs`, `field_diffs`, `findings`, `certifications` → run set `completed` with verdict → UI polls and renders from the ledger.

## Data model is the centerpiece

The schema in `Parity_Build_Prompt.md` §6 must be used **exactly** — do not redesign it. The evidence chain (`certifications → verification_runs → field_diffs → test_cases`) must be reconstructable by joins. Dashboard analytics (divergence rate per field, drift over runs, coverage) must be **real SQL aggregations / window functions over `field_diffs` and `findings`**, not computed in JS — this is the deliberate data-model showcase.

## The pipeline (worker, 7 stages)

I/O contract: engine writes `inputs.csv` (header `seq,principal,rate,term,gross,tax_rate`); each program writes outputs CSV (header `seq,final_amount,net_pay`, money to exactly 2 decimals as strings). CSV is used because it is natural for COBOL.

1. **Generate** N inputs (default 10,000) + ~50 crafted boundary cases landing on exact half-cents (guarantees the rounding divergence is visible). Insert each as a `test_cases` row.
2. **Execute legacy (oracle)** — compile once (`cobc -x -free -o legacy legacy.cbl`), run against `inputs.csv`, store per-case outputs in `legacy_runs`.
3. **Execute migrated** — `python3 migrated.py inputs.csv migrated_outputs.csv`, store in `migrated_runs`.
4. **Equivalence + masking** — per-field `tolerance` (default `0.00` = exact) and a `mask` list for legitimately-variable fields (timestamps). Implement the masking hook even though the demo has no real non-determinism.
5. **Compare + localize** — a `field_diffs` row per case per field (`is_match`, `delta`, both values, `module_id`: `final_amount`→`interest_calc`, `net_pay`→`payroll`); aggregate per (field, module) into `findings` with `divergence_rate`, `max_abs_delta`, `severity`.
6. **Explain (LLM)** — Anthropic API (`claude-sonnet-4-6`, key via `ANTHROPIC_API_KEY`), per finding, with 8 sampled `(inputs, legacy_value, migrated_value)` tuples → root cause + suggested fix.
7. **Certify** — `NOT_CERTIFIED` if any finding exists, else `CERTIFIED`; insert `certifications` with counts + `coverage_summary` JSON; set run `completed`.

Wrap all stages in try/catch; on failure set run `failed` with `error`.

The seed assets in `Parity_Build_Prompt.md` §10 carry an **intentional** bug in `migrated.py` — do not "fix" it. `fixed.py` (Decimal + ROUND_HALF_UP) is the correct reference for the optional re-verify-goes-CERTIFIED flow.

## Planned tech stack & commands

These do not exist yet — create them per the build prompt. Expected `package.json` scripts: `dev` (Next.js), `worker` (the verification worker), `db:migrate` (run `lib/schema.sql` against Aurora).

- Next.js (App Router) + React + TypeScript, Tailwind CSS, Recharts; deploy on Vercel.
- Aurora access via `postgres` (porsager) or `pg`.
- Worker: Node + TypeScript, `node:child_process`, `csv-parse`/`csv-stringify`.
- GnuCOBOL required for the worker (`brew install gnu-cobol` / `apt-get install gnucobol`) plus `python3`.
- Env: `DATABASE_URL`, `ANTHROPIC_API_KEY`.

Build in the order in §12: scaffold + DB connectivity → pipeline as a local CLI that **catches the rounding bug** (riskiest, do before UI) → LLM explanation → API routes → screens → convert CLI into the worker poll loop → deploy.

## Design system (from DESIGN.md)

Forensic instrument that issues a verdict — audit-credible, calm, exact; never playful or alarmist. Two carrying principles: **comparison is the product** (side-by-side diff is the signature motif) and **exact values are sacred** (every value/delta/field set in mono).

- **Color** (forensic-ledger palette): `--ink #0F1A2A`, `--ink-soft #1C2A3D`, `--paper #F4F5F2`, `--surface #FFFFFF`, `--rule #D9D9D2`, `--muted #5B6470`, `--verified #167C5B`, `--divergent #B3261E`, `--amber #B26B00`, `--instrument #1F5F7A`. Verdict colors (`--verified`/`--divergent`) are reserved for verdict/divergence semantics only — never decorative.
- **Type**: Spectral (serif) for verdict word / report titles only; IBM Plex Sans for all UI/body; IBM Plex Mono (tabular figures) for every value, field, delta, and code. Sentence case throughout.
- **Space** 4/8/12/16/24/32/48/64; **radius** 6px cards/controls, 4px pills/inputs; flat by default, one soft shadow `0 1px 3px rgba(15,26,42,.08)`.
- **Three signature elements** (design these with care; keep everything else quiet): the **equivalence spine** (two aligned LEGACY/MIGRATED columns, `=` when matching, broken with `≠` + delta when diverging), the **verdict seal** (formal stamp on an ink field, not a toast), the **live ledger** (dense mono tables + SQL-backed charts that read as real records).
- **Motion**: restraint; one orchestrated moment is the seal stamping in on run completion (~250ms scale/opacity). Respect `prefers-reduced-motion`.
- **A11y**: color never the only signal (pair with label + glyph `=`/`≠`); WCAG AA; visible `--instrument` focus ring; tables degrade to stacked pairs on narrow screens.
