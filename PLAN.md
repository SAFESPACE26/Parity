# Parity — Build Plan & Roadmap

Living execution plan to a complete H0 hackathon submission. Companion to `Parity_Build_Prompt.md` (the build contract), `FUNCTIONAL.md` (behavior), `DESIGN.md` (look/feel). Check items off as they land.

---

## Context

- **Hackathon:** H0 — Hack the Zero Stack with Vercel v0 and AWS Databases (sponsors: AWS + Vercel).
- **Track:** Monetizable **B2B** (migration verification for banks / insurers / system integrators).
- **Required stack (qualification):** Aurora PostgreSQL · Vercel · Next.js. ✅ already aligned.
- **Deadline:** ~June 29, 2026 (sprint). Today: 2026-06-17.
- **Win thesis:** Design is covered. Points come from **database integration depth** (the Aurora equivalence ledger + real SQL) and **originality** (the agentic, ledger-native divergence hunter + copilot). Spend remaining time there.

## Status snapshot

**Done**
- [x] UI-only Next.js frontend on `feature/frontend`: landing (`/`), dashboard (`/projects`), new verification + upload UX (`/verify/new`), run theater + report (`/runs/[id]`), diff explorer (`/runs/[id]/diffs`).
- [x] Design system in `lib/tokens.ts`; mock ledger + helpers in `lib/mock.ts`; landing animations (`app/components/landing/*`).
- [x] Docs updated for upload + sandbox + black-box contract + agentic layer (§7a) + agent tables (§6).

**Not started (the gap to qualify + win)**
- [ ] Real Aurora ledger + SQL API + worker pipeline.
- [ ] Agentic layer (divergence hunter + ledger copilot).
- [ ] Vercel deploy + submission assets.

## Target architecture (recap)

```
Browser ── Next.js (Vercel) ──SQL──► Aurora PostgreSQL ◄──SQL── Worker (Node/TS, local or Fargate)
                 │  reads/writes ledger              job row = queue       │ runs pipeline §7 + agent §7a
                 └ no heavy exec                                            └ sandboxes uploaded code; Anthropic tool-use
```

---

## Milestones (ordered)

### M1 — Aurora + connectivity (qualify) ⟶ P0
- [ ] `lib/schema.sql` = DDL from build-prompt §6 (incl. `agent_steps`, `agent_queries`).
- [ ] `lib/db.ts` — Aurora client (`postgres`/`pg`), parameterized query helpers, pooled.
- [ ] Provision Aurora PostgreSQL (Vercel–AWS Databases integration); set `DATABASE_URL`.
- [ ] `npm run db:migrate` runs schema against Aurora; confirm connectivity.
- [ ] Read-only Postgres role for agent query tool.

### M2 — Pipeline as local CLI (riskiest first) ⟶ P0
- [ ] `fixtures/cobol-interest-payroll/`: `legacy.cbl`, `migrated.py` (seeded bug), `fixed.py`.
- [ ] Install GnuCOBOL + python3; confirm `legacy.cbl` compiles.
- [ ] `engine/generate.ts` — N inputs + ~50 half-cent boundary cases → `test_cases` + `inputs.csv`.
- [ ] `engine/sandbox.ts` — isolated exec: no network, mem/wall-time caps, ephemeral FS.
- [ ] `engine/execute.ts` — run legacy + migrated via sandbox → `legacy_runs` / `migrated_runs`.
- [ ] `engine/compare.ts` — field diffs + aggregation → `field_diffs` + `findings` (oracle rules `is_match`).
- [ ] **Gate:** CLI run reliably yields a `final_amount` divergence + writes evidence. Deterministic.

### M3 — Explain + certify ⟶ P0
- [ ] `engine/explain.ts` — Anthropic call per finding → `explanation` + `suggested_fix`.
- [ ] Stage 7 certify → `certifications` + run `completed` + verdict.
- [ ] `engine/worker.ts` — poll loop: claim `queued` run, run pipeline, set `failed` on error.
- [ ] `npm run worker`.

### M4 — API routes (real SQL) ⟶ P0
- [ ] `POST /api/projects` (+ `/demo` seed), `POST /api/runs`, `GET /api/runs/[id]`.
- [ ] `GET /api/runs/[id]/findings`, `/diffs` (paginated, joined), `/coverage` (GROUP BY + window funcs), `/certification`.
- [ ] `GET /api/projects/[id]/runs` (drift).
- [ ] **Analytics in SQL, not JS** — this is the scored bit.

### M5 — Agentic layer (differentiator) ⟶ P1
- [ ] Agent runtime in worker: Anthropic tool use; tools `query_ledger` (read-only), `generate_probes`, `read_source`, `write_finding`.
- [ ] Log every action → `agent_steps`; every SQL → `agent_queries`.
- [ ] **Divergence hunter** (§7a #1): hypothesize → probe → oracle rules → narrow. Seed for deterministic demo.
- [ ] **Ledger copilot** (§7a #2): `POST /api/runs/[id]/ask` → NL→validated read-only SQL → `{answer, sql, rows}`.
- [ ] `GET /api/runs/[id]/agent` → trajectory for the theater UI.
- [ ] Stretch: RAG root-cause (#3), fix-and-reverify new run (#4).

### M6 — Wire frontend to live data ⟶ P1
- [ ] Replace `lib/mock.ts` reads with API calls; run page polls `GET /api/runs/[id]`.
- [ ] Investigation theater reads real `agent_steps`; report provenance from agent trajectory.
- [ ] Functional upload → `POST /api/projects` then `/api/runs`.
- [ ] Add copilot UI surface (ask box → answer + shown SQL) on report / diff explorer.
- [ ] Keep `prefers-reduced-motion` + a11y intact.

### M7 — Deploy + submission ⟶ P0 (can't win without)
- [ ] Deploy Next.js to **Vercel**; Aurora via integration; env `DATABASE_URL`, `ANTHROPIC_API_KEY`.
- [ ] Worker: run locally for demo (or containerize → Fargate). Document the COBOL+python image.
- [ ] End-to-end demo on deployed app: demo run → NOT_CERTIFIED → finding/explain → fix → CERTIFIED.
- [ ] **Submission assets:** ≤3-min demo video (YouTube); architecture diagram; screenshot proving Aurora usage; published Vercel link + **Vercel Team ID**; text desc naming the AWS DB.
- [ ] Optional: `#H0Hackathon` post for bonus.

---

## Suggested sprint sequence

1. M1 → M2 → M3 (get a real, deterministic, DB-backed run end-to-end — qualifies + nails the core criterion). **Do not skip the M2 gate.**
2. M4 (real SQL API) → M6 (wire frontend) — now the built UI shows live Aurora data.
3. M5 (agent: hunter + copilot) — the originality/impact differentiator.
4. M7 throughout the last day — deploy early, then assets.

If time runs short: ship M1–M4 + M6 + M7 (a real DB-backed product, deployed) before M5. A working ledger beats a half-wired agent.

## Acceptance criteria

**Qualify:** deployed on Vercel; Aurora PostgreSQL is the store; heavy exec outside the web layer; submission assets complete.

**Win (from build-prompt §13 + judging):**
- [ ] Demo yields NOT_CERTIFIED with a localized `final_amount` finding, every run, deterministically.
- [ ] Evidence chain reconstructable by joins; analytics are SQL aggregations/window functions, not JS.
- [ ] LLM explanation names the rounding/decimal cause + concrete fix.
- [ ] Agent trajectory persisted in the ledger and shown in the theater/provenance.
- [ ] Ledger copilot answers an NL question with the SQL shown, live on Aurora.
- [ ] Re-verify with `fixed.py` → CERTIFIED; drift visible across runs.

## Risks / watch-outs

- **GnuCOBOL/runtime install** in the worker (and any Fargate image) — verify early (M2).
- **Determinism** — seed input gen + agent probes; the seeded divergence must always surface.
- **Agent SQL safety** — read-only role, parameterized, validated, statement timeout. Oracle, not agent, rules equivalence.
- **Sprint scope** — M5 is the differentiator but M1–M4+M7 are mandatory. Cut M5 stretch (#3/#4) before cutting a working deploy.
- **Vercel function limits** — never run the pipeline/agent in a route handler; worker only.
