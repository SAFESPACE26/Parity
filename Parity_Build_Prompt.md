# Build Prompt — Parity

> **Paste this whole document to an AI coding agent (Claude Code, Cursor, or similar).** It is a complete build specification. Follow it top to bottom. Where you must make a judgment call, prefer the simplest implementation that satisfies the Acceptance Criteria (§13). Do **not** redesign the data model — use the schema in §6 exactly.

---

## 0. Your mission

Build **Parity**, an independent verification layer for AI-generated legacy-code migrations. A reviewer uploads a legacy codebase and its AI-migrated version (or picks the built-in demo) and declares a **comparison contract**; Parity runs both inside an isolated **sandbox** against the same generated inputs, compares their outputs down to the field level, localizes any divergence, explains it, and records the full evidence in a queryable **equivalence ledger** in Amazon Aurora PostgreSQL. It then issues a **CERTIFIED** or **NOT CERTIFIED** verdict.

The v1 comparison contract is **black-box**: each program reads the same generated inputs (CSV) and writes a set of named output fields, which Parity diffs against the oracle. Function-level and HTTP-service contracts are future work. The built-in COBOL→Python demo is one preconfigured instance of the black-box contract.

The product's value is the ledger and the verdict, not the test runner. Treat the Aurora data model as the centerpiece.

## 1. Hard constraints (non-negotiable)

- **Frontend deploys on Vercel.** Next.js (App Router), TypeScript.
- **Primary data store is Amazon Aurora PostgreSQL**, provisioned via the Vercel–AWS Databases integration. All evidence lives here.
- **The heavy verification execution must NOT run inside a Vercel serverless function** (it compiles and runs programs over thousands of inputs and will exceed function limits). It runs as a separate **TypeScript worker** that can run locally for the demo and deploy to AWS Fargate for production. The worker and the Next.js app communicate only through Aurora (a job row acts as the queue).
- **Uploaded code is untrusted and must run only in an isolated sandbox** — no outbound network, capped memory and wall-time, ephemeral filesystem, no access to other projects' artifacts or to Parity's credentials. For the local demo the sandbox may be a constrained child process / container; for production use per-run containers (Docker + gVisor), microVMs (Firecracker), or a hosted sandbox (e.g. E2B / Modal). Never execute uploaded code in the Next.js layer or at upload time.

## 2. Target demo (build toward this exact end state)

A user opens Parity, clicks **New Verification**, selects the built-in demo **"COBOL Interest & Payroll"** (a legacy COBOL program plus its AI-migrated Python version), and runs it. Parity generates 10,000 inputs, executes both programs in parallel, and compares results. The migration looks correct on inspection but the dashboard lights up: the `final_amount` field diverges on a fraction of inputs by exactly one cent, caused by a rounding-mode difference (the COBOL oracle rounds half away from zero; the Python migration uses floating-point banker's rounding). Parity localizes the divergence to that field, an LLM explains the root cause and suggests a fix, and the migration is stamped **NOT CERTIFIED** — with every comparison sitting queryable in the Aurora ledger and visible in a diff explorer and a SQL-backed drift dashboard.

The demo must be **deterministic**: the seeded bug must reliably produce visible divergences on every run.

## 3. Architecture

Three components, communicating through Aurora:

1. **Next.js app (Vercel)** — UI + API routes. Handles project creation and uploads, enqueues verification runs (inserts a row), and serves all ledger data back to the UI via SQL queries against Aurora. Does no heavy execution.
2. **Verification engine / worker (TypeScript, Node)** — a long-running process that polls Aurora for queued runs, executes the full pipeline (§7), runs each side's contract command **inside an isolated sandbox** (shelling out to `cobc`/`cobcrun` for the COBOL demo and `python3` for the migrated program), writes all evidence to Aurora, and sets the verdict. Runs locally for the demo (`npm run worker`); deployable to Fargate.
3. **Amazon Aurora PostgreSQL** — the equivalence ledger and job queue (schema in §6).

Data flow: UI → POST creates a `verification_runs` row (status `queued`) → worker claims it (`running`) → worker writes `test_cases`, `legacy_runs`, `migrated_runs`, `field_diffs`, `findings`, `certifications` → worker sets run `completed` with verdict → UI polls run status and renders results from the ledger.

## 4. Tech stack

- Next.js (App Router) + TypeScript + React, deployed on Vercel.
- Tailwind CSS for styling. Charts via Recharts.
- Amazon Aurora PostgreSQL. Access via `postgres` (porsager) or `pg`. Use parameterized queries.
- Verification worker: Node + TypeScript. Uses `node:child_process` to run programs, `csv-parse`/`csv-stringify` for I/O.
- COBOL execution: GnuCOBOL (`cobc -x -free`, run with `cobcrun` or the compiled binary). Document the install (`apt-get install gnucobol` / `brew install gnu-cobol`).
- LLM explanation + agentic verification: Anthropic API (`claude-sonnet-4-6`) with tool use, key via `ANTHROPIC_API_KEY`. The agent loop runs inside the worker (never Vercel). See §7a.

## 5. Repository structure

```
parity/
  app/                      # Next.js App Router
    page.tsx                # projects dashboard
    verify/new/page.tsx     # new verification (upload or demo)
    runs/[id]/page.tsx      # run progress + results/certification
    runs/[id]/diffs/page.tsx# diff explorer
    api/                    # route handlers (see §8)
  lib/
    db.ts                   # Aurora client + query helpers
    schema.sql              # DDL from §6
  engine/
    worker.ts               # poll loop: claim queued run, run pipeline
    pipeline.ts             # the 7 stages (§7)
    generate.ts             # input generation
    sandbox.ts              # isolated execution: limits, no network, ephemeral FS
    execute.ts              # run legacy + migrated programs via sandbox.ts
    compare.ts              # equivalence relation + field diffing
    explain.ts              # Anthropic call for findings
  fixtures/
    cobol-interest-payroll/
      legacy.cbl            # seed COBOL (§10)
      migrated.py           # seed buggy Python (§10)
      fixed.py              # correct reference (target of suggested fix)
  package.json              # scripts: dev, worker, db:migrate
```

## 6. Data model — Aurora PostgreSQL (use exactly)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  source_language TEXT NOT NULL,            -- 'COBOL'
  target_language TEXT NOT NULL,            -- 'Python'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL                 -- 'interest_calc', 'payroll'
);

CREATE TABLE verification_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id),
  status                TEXT NOT NULL DEFAULT 'queued',  -- queued|running|completed|failed
  input_count           INTEGER NOT NULL DEFAULT 0,
  fields_checked        INTEGER NOT NULL DEFAULT 0,
  diverging_input_count INTEGER NOT NULL DEFAULT 0,
  verdict               TEXT,                            -- CERTIFIED|NOT_CERTIFIED
  error                 TEXT,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE test_cases (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id  UUID NOT NULL REFERENCES verification_runs(id),
  seq     INTEGER NOT NULL,
  inputs  JSONB NOT NULL
);
CREATE INDEX ON test_cases (run_id, seq);

CREATE TABLE legacy_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id  UUID NOT NULL REFERENCES test_cases(id),
  outputs       JSONB NOT NULL,
  exec_ms       INTEGER
);

CREATE TABLE migrated_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id  UUID NOT NULL REFERENCES test_cases(id),
  outputs       JSONB NOT NULL,
  exec_ms       INTEGER
);

CREATE TABLE field_diffs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES verification_runs(id),
  test_case_id  UUID NOT NULL REFERENCES test_cases(id),
  module_id     UUID REFERENCES modules(id),
  field_name    TEXT NOT NULL,
  legacy_value  TEXT NOT NULL,
  migrated_value TEXT NOT NULL,
  is_match      BOOLEAN NOT NULL,
  delta         NUMERIC
);
CREATE INDEX ON field_diffs (run_id, is_match);
CREATE INDEX ON field_diffs (run_id, field_name);

CREATE TABLE findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES verification_runs(id),
  module_id       UUID REFERENCES modules(id),
  field_name      TEXT NOT NULL,
  diverging_count INTEGER NOT NULL,
  total_count     INTEGER NOT NULL,
  divergence_rate NUMERIC NOT NULL,
  max_abs_delta   NUMERIC,
  severity        TEXT NOT NULL,            -- critical|high|medium|low
  explanation     TEXT,                     -- LLM
  suggested_fix   TEXT,                     -- LLM
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE certifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL UNIQUE REFERENCES verification_runs(id),
  verdict         TEXT NOT NULL,            -- CERTIFIED|NOT_CERTIFIED
  input_count     INTEGER NOT NULL,
  fields_checked  INTEGER NOT NULL,
  finding_count   INTEGER NOT NULL,
  coverage_summary JSONB,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent trajectory — the divergence-hunter's reasoning, persisted as evidence (§7a).
CREATE TABLE agent_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES verification_runs(id),
  seq         INTEGER NOT NULL,
  kind        TEXT NOT NULL,               -- read|map|hypothesis|probe|narrow|diagnose|oracle_ruling
  summary     TEXT NOT NULL,               -- one-line human-readable step
  detail      JSONB,                        -- hypothesis, probe spec, ruling, etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON agent_steps (run_id, seq);

-- Every SQL the agent runs against the ledger — transparency + audit + powers the copilot.
CREATE TABLE agent_queries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES verification_runs(id),
  step_id       UUID REFERENCES agent_steps(id),
  question      TEXT,                        -- natural-language ask (copilot) or null (autonomous)
  sql           TEXT NOT NULL,               -- the parameterized SQL actually executed (read-only)
  row_count     INTEGER,
  result_sample JSONB,                        -- small sample of returned rows
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON agent_queries (run_id, created_at);
```

The evidence chain (`certifications → verification_runs → field_diffs → test_cases`) must be reconstructable by joins. The dashboard analytics (§9) must use SQL aggregations / window functions over `field_diffs` and `findings` — this is the deliberate-data-model showcase, so make these queries real, not computed in JS.

## 7. The verification engine (pipeline.ts — seven stages)

**I/O contract between engine and programs.** The engine writes `inputs.csv` with header `seq,principal,rate,term,gross,tax_rate`. Each program reads it and writes an outputs CSV with header `seq,final_amount,net_pay`, one row per case, money fields formatted to exactly 2 decimals as strings. The engine parses both. (CSV is used because it is natural for COBOL; do not require the programs to parse JSON.)

**Stage 1 — Generate inputs.** Produce N cases (default 10,000). Randomize: `principal` 1000.00–100000.99, `rate` 0.0001–0.1500 (4dp), `term` 1–30 (int), `gross` 1000.00–20000.99, `tax_rate` 0.1000–0.3700 (4dp). **Also inject ~50 crafted boundary cases** engineered so intermediate products land on exact half-cents (…x.xx5), guaranteeing the rounding divergence is visible. Insert each as a `test_cases` row and write to `inputs.csv`.

**Stage 2 — Execute legacy (the oracle), sandboxed.** Run the contract's legacy command inside an isolated sandbox (`sandbox.ts`): no network, capped memory/wall-time, ephemeral working dir seeded with the uploaded sources and `inputs.csv`. For the demo this compiles once (`cobc -x -free -o legacy legacy.cbl`) and runs against `inputs.csv`. Capture the outputs CSV; store per-case `outputs` JSON (`{final_amount, net_pay}`) in `legacy_runs` with `exec_ms`.

**Stage 3 — Execute migrated, sandboxed.** Run the contract's migrated command in a separate sandbox (demo: `python3 migrated.py inputs.csv migrated_outputs.csv`), parse, store in `migrated_runs`. A sandbox that times out or exceeds limits records a per-case failure rather than aborting the run.

**Stage 4 — Equivalence relation + non-determinism masking.** Apply a configurable rule set: per-field `tolerance` (default `0.00` = exact) and a `mask` list of fields treated as legitimately variable (e.g., timestamps). For money fields, compare the 2-decimal string values; compute `delta = |legacyNum − migratedNum|`. (No real non-determinism exists in this pure-compute demo, but implement the masking hook and a one-line note in the UI that it exists — it is core to the general design.)

**Stage 5 — Differential comparison + localization.** For every test case and every output field, write a `field_diffs` row (`is_match`, `delta`, both values, mapped `module_id`: `final_amount`→`interest_calc`, `net_pay`→`payroll`). Then aggregate per (field, module): count diverging vs total, `divergence_rate`, `max_abs_delta`, and a `severity` (`critical` if a money field diverges at all, scaling down by rate otherwise). Write a `findings` row per diverging field. Update the run's `diverging_input_count` and `fields_checked`.

**Stage 6 — Explain (LLM).** For each finding, call the Anthropic API with: source/target languages, field name, divergence rate, max delta, and 8 sampled `(inputs, legacy_value, migrated_value)` tuples. Ask for (a) the single most likely root cause and (b) a concrete suggested fix. Store both on the finding. The model should be able to identify the rounding-mode / float-vs-decimal cause from the examples.

**Stage 7 — Certify.** Verdict is `NOT_CERTIFIED` if any finding exists, else `CERTIFIED`. Insert a `certifications` row with counts and a `coverage_summary` JSON (inputs, fields checked, per-field divergence rates). Set the run `completed`, `verdict`, `completed_at`.

The worker wraps all stages in try/catch; on failure set run `failed` with `error`.

## 7a. Agentic verification layer (the differentiator)

Parity's intelligence runs **through Aurora**: the agent's reasoning is expressed as SQL over the ledger and writes back evidence. The agent loop runs in the worker (Anthropic `claude-sonnet-4-6`, tool use), never in a Vercel function. **Hard rule: the oracle decides equivalence; the agent never sets `is_match` or the verdict.** Agents only search, retrieve, explain, and remediate.

**Agent tools (worker-side):**
- `query_ledger(sql)` — runs read-only SQL against the ledger via a **read-only Postgres role**; parameterized, statement-timeout capped. Every call is logged to `agent_queries`.
- `generate_probes(spec)` — inserts crafted `test_cases` (e.g. inputs engineered onto half-cent boundaries) for the oracle + migrated program to execute. Write scope: `test_cases` only.
- `read_source(path)` — reads the project's stored legacy/migrated sources (read-only).
- `write_finding(finding)` — upserts a `findings` row's `explanation`/`suggested_fix`. Never touches match/verdict columns.

Each meaningful action appends an `agent_steps` row (kind: read|map|hypothesis|probe|narrow|diagnose|oracle_ruling), so the full trajectory is queryable and drives the investigation-theater UI (`/runs/[id]` verifying state) and the finding's "how it was found" provenance.

**Build these (priority order):**

1. **Divergence-hunter (P1 — core).** Reads both programs, hypothesizes failure modes (rounding, float-vs-decimal, overflow, locale, off-by-one, date math), and uses `query_ledger` + `generate_probes` to target and bisect divergences instead of relying only on random inputs. Loop: query patterns → hypothesize → probe → oracle rules → narrow → diagnose. Replaces/augments Stage 1's static boundary cases.
2. **Ledger copilot (P1 — demo wow).** A natural-language → SQL endpoint over the ledger: the reviewer asks ("which inputs diverge most, and what do they share?"), the agent emits **parameterized, validated, read-only** SQL, runs it on Aurora, and returns the answer **plus the SQL it ran** (shown in the UI). Logged to `agent_queries`. Surfaced on the run report / diff explorer.
3. **RAG root-cause (P2).** Upgrade Stage 6: instead of 8 random tuples, run stratified SQL (worst delta, boundary inputs, distribution via window functions) to retrieve the most informative diverging cases, then explain grounded in those rows.
4. **Fix-and-reverify (P2).** Agent proposes a fix, the worker runs the fixed program in a sandbox, inserts a **new** `verification_runs` + `certifications`, and drift across runs is computed by SQL — demonstrating the append-only multi-run lineage.

**Determinism for the demo:** the built-in example must still produce NOT_CERTIFIED every run. Seed the agent's probe generation and cache/replay its trajectory so the demo is repeatable; the autonomous hunt is shown but the seeded divergence is guaranteed.

**Security:** agent SQL uses a read-only role; write tools are scoped to `test_cases`/`findings`; agent-run probes execute in the sandbox (§1) like any uploaded code; all agent SQL and steps are persisted, so the agent's behavior is itself auditable in the ledger.

## 8. Backend API (Next.js route handlers)

- `POST /api/projects` — create a project from an uploaded pair: legacy + migrated sources (files or archive), the language of each, and the comparison contract `{ inputSchema, outputFields, legacyCmd, migratedCmd }`. Store sources as project artifacts; do **not** execute anything here. A `POST /api/projects/demo` seeds the "COBOL Interest & Payroll" project, its two modules, the prefilled contract, and copies the fixtures.
- `POST /api/runs` — body `{ projectId, inputCount?, tolerance? }`; inserts a `verification_runs` row (`queued`); returns `{ runId }`. The worker reads the project's stored sources and contract when it claims the run.
- `GET /api/runs/[id]` — run row + summary (status, counts, verdict). Polled by the UI.
- `GET /api/runs/[id]/findings` — findings for the run.
- `GET /api/runs/[id]/diffs?field=&onlyMismatches=&limit=&offset=` — paginated `field_diffs` joined to `test_cases.inputs`.
- `GET /api/runs/[id]/coverage` — SQL aggregates: divergence rate per field, match/mismatch counts, coverage. Use `GROUP BY` + window functions.
- `GET /api/runs/[id]/certification` — the certification record.
- `GET /api/runs/[id]/agent` — the agent trajectory (`agent_steps`) + queries (`agent_queries`) for the investigation theater and finding provenance.
- `POST /api/runs/[id]/ask` — ledger copilot (§7a #2): body `{ question }`; returns `{ answer, sql, rows }`. The route forwards to the worker/agent; the SQL is read-only, parameterized, and validated before execution.
- `GET /api/projects/[id]/runs` — run history for drift-over-time.

## 9. Frontend screens

1. **Projects dashboard** (`/`) — list projects with their latest verdict badge (green CERTIFIED / red NOT CERTIFIED) and last-run time; prominent **New Verification** button.
2. **New Verification** (`/verify/new`) — choose **Use demo: COBOL Interest & Payroll**, or upload a legacy codebase and a migrated codebase (one-or-more files / archive per side, drag-or-click), pick the language of each, and declare the comparison contract (input schema, compared output fields, run command per side — prefilled, editable). A sandbox-isolation note states uploaded code runs only in an isolated sandbox. Configure input count (default 10,000) and tolerance (default exact); **Run** is gated until both sides are supplied → POST `/api/projects` then `/api/runs` → redirect to the run page.
3. **Run page** (`/runs/[id]`) — while `running`, show a live progress view (poll `/api/runs/[id]`): inputs generated, executions complete, diffs computed, with a progress bar. When `completed`, render the **certification report**: a large verdict banner; summary stats (inputs, fields checked, diverging inputs, coverage %); a **findings** list (field, divergence rate, max delta, severity, the LLM explanation, the suggested fix); and a **drift chart** (divergence rate across this project's runs).
4. **Diff explorer** (`/runs/[id]/diffs`) — filter by field and an "only mismatches" toggle; a table of `seq | inputs | legacy_value | migrated_value | delta` with mismatched rows highlighted; clicking a row expands the full input and both outputs.
5. **Analytics on the report page** — three SQL-backed visuals: divergence rate per field (bar), divergence over runs (line = drift over time), and a coverage gauge. Label them as live queries against the Aurora ledger.

**Design direction:** clean, enterprise/audit-credible, restrained palette, lots of whitespace, monospace for values and code. The verdict banner is the emotional centerpiece. Make the ledger visibly do work — show real numbers from SQL, not placeholders.

## 10. Seed assets (the demo program + seeded bug)

Place these in `fixtures/cobol-interest-payroll/`. The COBOL is the **oracle**; the Python is the **migration under test** with an intentional, realistic rounding bug. Verify the COBOL compiles under GnuCOBOL and adjust syntax as needed, but **preserve the rounding semantics** (COBOL `ROUNDED` = round half away from zero).

`legacy.cbl` (reference — make it compile, keep semantics):

```cobol
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PARITY-LEGACY.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT IN-FILE  ASSIGN TO "inputs.csv"
               ORGANIZATION IS LINE SEQUENTIAL.
           SELECT OUT-FILE ASSIGN TO "legacy_outputs.csv"
               ORGANIZATION IS LINE SEQUENTIAL.
       DATA DIVISION.
       FILE SECTION.
       FD IN-FILE.   01 IN-REC  PIC X(160).
       FD OUT-FILE.  01 OUT-REC PIC X(160).
       WORKING-STORAGE SECTION.
       01 WS-EOF        PIC X VALUE "N".
       01 WS-FIRST      PIC X VALUE "Y".
       01 WS-SEQ        PIC X(7).
       01 WS-PRIN       PIC 9(9)V99.
       01 WS-RATE       PIC 9(1)V9999.
       01 WS-TERM       PIC 9(2).
       01 WS-GROSS      PIC 9(9)V99.
       01 WS-TAXR       PIC 9(1)V9999.
       01 WS-FINAL      PIC 9(11)V99 COMP-3.
       01 WS-TAX        PIC 9(11)V99 COMP-3.
       01 WS-NET        PIC 9(11)V99 COMP-3.
       01 WS-I          PIC 9(2).
       01 F-PRIN PIC X(13). 01 F-RATE PIC X(8). 01 F-TERM PIC X(2).
       01 F-GROSS PIC X(13). 01 F-TAXR PIC X(8).
       01 O-FINAL PIC X(15). 01 O-NET PIC X(15).
       PROCEDURE DIVISION.
       MAIN.
           OPEN INPUT IN-FILE OUTPUT OUT-FILE
           MOVE "seq,final_amount,net_pay" TO OUT-REC
           WRITE OUT-REC
           PERFORM UNTIL WS-EOF = "Y"
             READ IN-FILE INTO IN-REC
               AT END MOVE "Y" TO WS-EOF
               NOT AT END
                 IF WS-FIRST = "Y"
                   MOVE "N" TO WS-FIRST     *> skip header row
                 ELSE
                   PERFORM PROCESS-ROW
                 END-IF
             END-READ
           END-PERFORM
           CLOSE IN-FILE OUT-FILE
           STOP RUN.
       PROCESS-ROW.
           UNSTRING IN-REC DELIMITED BY ","
             INTO WS-SEQ F-PRIN F-RATE F-TERM F-GROSS F-TAXR
           COMPUTE WS-PRIN  = FUNCTION NUMVAL(F-PRIN)
           COMPUTE WS-RATE  = FUNCTION NUMVAL(F-RATE)
           COMPUTE WS-TERM  = FUNCTION NUMVAL(F-TERM)
           COMPUTE WS-GROSS = FUNCTION NUMVAL(F-GROSS)
           COMPUTE WS-TAXR  = FUNCTION NUMVAL(F-TAXR)
           MOVE WS-PRIN TO WS-FINAL
           PERFORM VARYING WS-I FROM 1 BY 1 UNTIL WS-I > WS-TERM
             COMPUTE WS-FINAL ROUNDED = WS-FINAL * (1 + WS-RATE)
           END-PERFORM
           COMPUTE WS-TAX ROUNDED = WS-GROSS * WS-TAXR
           COMPUTE WS-NET = WS-GROSS - WS-TAX
           MOVE WS-FINAL TO O-FINAL
           MOVE WS-NET   TO O-NET
           STRING FUNCTION TRIM(WS-SEQ) "," FUNCTION TRIM(O-FINAL)
                  "," FUNCTION TRIM(O-NET) DELIMITED BY SIZE INTO OUT-REC
           WRITE OUT-REC.
```

`migrated.py` (the migration under test — **bug intentional, do not "fix"**):

```python
import csv, sys
# AI-migrated from COBOL. BUG (seeded): float arithmetic + banker's rounding,
# whereas the COBOL oracle uses fixed-decimal round-half-away-from-zero.
def run(inp, outp):
    with open(inp) as f, open(outp, "w", newline="") as g:
        r = csv.reader(f); w = csv.writer(g)
        next(r, None)  # header
        w.writerow(["seq", "final_amount", "net_pay"])
        for row in r:
            if not row: continue
            seq, principal, rate, term, gross, tax_rate = row
            principal, rate, term = float(principal), float(rate), int(term)
            gross, tax_rate = float(gross), float(tax_rate)
            final = principal
            for _ in range(term):
                final = round(final * (1 + rate), 2)   # <-- banker's rounding on float
            tax = round(gross * tax_rate, 2)
            net = round(gross - tax, 2)
            w.writerow([seq, f"{final:.2f}", f"{net:.2f}"])
if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
```

`fixed.py` (correct reference — what the suggested fix should converge toward): identical but using `decimal.Decimal` with `ROUND_HALF_UP` for every monetary operation. Include it so the demo can optionally show a re-run going CERTIFIED.

## 11. Deployment

- Next.js app → **Vercel**. Provision **Aurora PostgreSQL** through the Vercel–AWS Databases integration; set `DATABASE_URL` and `ANTHROPIC_API_KEY` as Vercel env vars. Run `schema.sql` against Aurora (a `db:migrate` script).
- Worker → run locally for the demo (`npm run worker`); for production, containerize and run on **AWS Fargate**, reading the same `DATABASE_URL`. The worker needs GnuCOBOL and Python in its image.
- Keep all heavy execution in the worker; the Vercel app only reads/writes Aurora.

## 12. Build sequence (milestones)

1. Scaffold Next.js + Tailwind; add `lib/db.ts`; run `schema.sql` against Aurora; confirm connectivity.
2. Add fixtures; build the pipeline as a local CLI (`generate → execute → compare → ledger writes`) and confirm it **catches the rounding bug** and writes `field_diffs`/`findings`. This is the riskiest part — do it before any UI.
3. Add Stage 6 LLM explanation.
4. Build the API routes reading from the ledger.
5. Build the screens (§9), wiring the run page's polling.
6. Convert the CLI into `engine/worker.ts` with the job-claim loop; make the dashboard analytics real SQL.
7. Deploy to Vercel + Aurora; run the demo end to end; record the 3–5 min video.

## 13. Acceptance criteria

- Running the demo project yields **NOT_CERTIFIED** with at least one `finding` on `final_amount`, every run, deterministically.
- The divergence is localized to the field, with example diffs viewable in the diff explorer (legacy vs migrated values and per-case delta).
- The finding carries an LLM explanation that identifies a rounding/decimal cause and a concrete suggested fix.
- The full evidence chain is present in Aurora and reconstructable by joins; the report's analytics are produced by SQL aggregations/window functions, not JS.
- The app is deployed on Vercel with Aurora PostgreSQL as the primary store; the heavy execution runs in the worker, not in a Vercel function.
- (Optional polish) Re-running with `fixed.py` as the migration yields **CERTIFIED**, demonstrating the full loop.
```
