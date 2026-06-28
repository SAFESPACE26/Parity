# Parity

**An independent verification layer for AI-generated legacy-code migrations.**

A reviewer uploads a legacy codebase and its migrated counterpart (or picks the built-in demo) and declares a **comparison contract**. Parity runs both programs inside an isolated sandbox against the same generated inputs, diffs every output field, localizes divergence to the responsible module, has an LLM explain the root cause, records everything in a queryable **equivalence ledger** (PostgreSQL / Aurora), and issues a **CERTIFIED / NOT_CERTIFIED** verdict.

The product's value is the ledger and the verdict — not the test runner.

> **Flagship demo — "COBOL Interest & Payroll":** a seeded rounding bug (COBOL `ROUNDED` round-half-away-from-zero vs Python float banker's rounding) makes `final_amount` diverge by one cent on a fraction of 10,000 inputs, deterministically, every run → **NOT_CERTIFIED**.

---

## Architecture

Three components that communicate **only through the database**:

```
Reviewer ──upload──▶ Next.js app (Vercel) ──INSERT verification_runs (queued)──▶  ┐
                          ▲  read ledger via SQL                                  │
                          │                                                  Aurora / Postgres
                          │                                          (equivalence ledger + job queue)
                     UI polls + renders                                           │
                                                                                  │
 Verification worker (Node + tsx) ──claim run (FOR UPDATE SKIP LOCKED)────────────┘
   └─ 7-stage pipeline ─▶ hardened sandbox (cobc / python3)
   └─ explain stage ────▶ OpenAI API
```

1. **Next.js app (App Router + TypeScript, deploys to Vercel)** — UI + API route handlers. Creates projects, enqueues runs, serves all ledger data back via SQL, and hosts the NL→SQL ledger copilot. Does **no** heavy execution.
2. **Verification worker (Node + TypeScript)** — a poll loop that claims queued runs, runs the 7-stage pipeline, shells out to `cobc`/`cobcrun` (GnuCOBOL) and `python3` inside a hardened sandbox, writes all evidence to the ledger, and sets the verdict.
3. **PostgreSQL / Aurora** — the equivalence ledger **and** the job queue. The only data store. All dashboard analytics are real SQL aggregations / window functions over `field_diffs` and `findings`.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full diagram and wiring details.

---

## The 7-stage pipeline (worker)

| # | Stage | What it does |
|---|-------|--------------|
| 1 | **Generate** | N inputs (default 10,000) + crafted boundary cases on exact half-cents → `test_cases` |
| 2 | **Execute legacy (oracle)** | compile once (`cobc -x -free -o legacy legacy.cbl`), run → `legacy_runs` |
| 3 | **Execute migrated** | `python3 migrated.py inputs.csv migrated_outputs.csv` → `migrated_runs` |
| 4 | **Equivalence + masking** | per-field tolerance (default `0.00` = exact) + mask hook for variable fields |
| 5 | **Compare + localize** | a `field_diffs` row per case per field; aggregate into `findings` (`divergence_rate`, `max_abs_delta`, `severity`) |
| 6 | **Explain (LLM)** | per finding, sampled `(inputs, legacy, migrated)` tuples → root cause + suggested fix |
| 7 | **Certify** | `NOT_CERTIFIED` if any finding exists, else `CERTIFIED`; insert `certifications` |

The worker stamps `verification_runs.stage` per phase so the UI shows real progress. All stages are wrapped in try/catch; on failure the run is set `failed` with an `error`.

**I/O contract:** the engine writes `inputs.csv` (header `seq,principal,rate,term,gross,tax_rate`); each program writes outputs CSV (header `seq,final_amount,net_pay`, money to exactly 2 decimals as strings).

---

## Sandbox (untrusted code)

Uploaded code is untrusted and runs **only** in the worker, never in the Next.js layer or at upload time. `engine/sandbox.ts` provides:

- a scrubbed environment — no `DATABASE_URL`, `OPENAI_API_KEY`, or AWS credentials reach the child;
- `ulimit` caps (address space, CPU, file size, process count);
- a captured-output cap;
- SIGKILL of the whole process group on wall-time / output breach;
- optional network isolation via `PARITY_SANDBOX_UNSHARE=1` (`unshare -n`).

---

## Ledger copilot (NL → SQL)

`POST /api/runs/[id]/ask` turns a natural-language question into one read-only SQL query over that run's ledger. Defense in depth: keyword denylist + single-statement check → forced `LIMIT` → execution inside a **read-only transaction** with a statement timeout. The LLM is never trusted to write.

---

## Tech stack

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript
- **Database:** PostgreSQL / Aurora via [`postgres`](https://github.com/porsager/postgres) (porsager)
- **Worker:** Node + TypeScript (`tsx`), `node:child_process`, `csv-parse` / `csv-stringify`
- **LLM:** OpenAI `gpt-4o-mini` (explain stage + ledger copilot)
- **External tools:** GnuCOBOL (`cobc` / `cobcrun`) and `python3` — required on the worker host

---

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (local) or an Aurora cluster
- For the worker: **GnuCOBOL** (`brew install gnu-cobol` / `apt-get install gnucobol`) and `python3`

### 1. Configure environment

Copy `.env.example` to `.env.local` and fill in:

```bash
DATABASE_URL=postgres://user:password@host:5432/parity
OPENAI_API_KEY=sk-...
```

> The app and worker must point `DATABASE_URL` at the **same** database — a job row is the queue. On a Vercel deploy with no `DATABASE_URL`, `lib/db.ts` falls back to Aurora IAM auth via the Vercel OIDC token (`AWS_ROLE_ARN` + `VERCEL_OIDC_TOKEN`).

### 2. Migrate the database

```bash
npm run db:migrate
```

### 3. Run the app and worker

```bash
npm run dev      # Next.js app at http://localhost:3000
npm run worker   # verification worker poll loop (separate terminal)
```

### Run the pipeline standalone

```bash
npm run pipeline:demo   # runs the 7-stage pipeline as a CLI against the demo fixture
npm run ledger:peek     # print a summary of the latest run from the ledger
```

### Docker Compose (Postgres + app + worker)

```bash
docker compose up
```

Brings up Postgres 16, the app (`:3000`), and the worker, all wired to the same database.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js app |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run worker` | Run the verification worker poll loop |
| `npm run pipeline:demo` | Run the pipeline as a one-shot CLI |
| `npm run db:migrate` | Apply `lib/schema.sql` |
| `npm run ledger:peek` | Inspect the latest run in the ledger |
| `npm run lint` | Lint |

---

## Repository layout

```
app/                 Next.js App Router — pages + API route handlers
  api/               projects, runs, diffs, findings, certification, coverage, ask, reverify, agent
  verify/new         upload + comparison-contract screen
  runs/[id]          run detail, equivalence spine, live ledger
engine/              the verification pipeline + worker
  generate.ts        stage 1 — input generation
  execute.ts         stages 2-3 — compile/run legacy + migrated
  compare.ts         stages 4-5 — diff + localize + findings
  explain.ts         stage 6 — LLM root-cause (OpenAI gpt-4o-mini)
  pipeline.ts        orchestrates the 7 stages
  sandbox.ts         hardened child-process execution
  worker.ts          poll loop that claims queued runs
  cli.ts             standalone pipeline runner
lib/
  db.ts              single DB connection (DATABASE_URL, IAM fallback)
  schema.sql         the equivalence-ledger schema
  tokens.ts          design tokens
fixtures/cobol-interest-payroll/
  legacy.cbl         COBOL oracle
  migrated.py        Python migration (carries the intentional rounding bug)
  fixed.py           correct reference (Decimal + ROUND_HALF_UP) for re-verify
scripts/             migrate.ts, peek-ledger.ts
```

---

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — components, DB wiring, sandbox, copilot
- [`Parity_Build_Prompt.md`](Parity_Build_Prompt.md) — authoritative build contract (schema §6, acceptance §13)
- [`FUNCTIONAL.md`](FUNCTIONAL.md) — actors, requirements, run lifecycle state machine, business rules
- [`DESIGN.md`](DESIGN.md) — UI/UX spec, token system, signature elements
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — walkthrough for the flagship demo

> **Note:** the bug in `fixtures/cobol-interest-payroll/migrated.py` is **intentional** — it is what makes the demo deterministically NOT_CERTIFIED. Do not "fix" it; `fixed.py` is the correct reference for the re-verify flow.
