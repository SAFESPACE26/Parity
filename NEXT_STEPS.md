# Parity — To-Do / Future Work

Status as of 2026-06-24. Backend + frontend complete and wired to a live ledger.
Running locally via docker compose (app + worker + postgres). Demo flow works
end-to-end: NOT_CERTIFIED demo, re-verify → CERTIFIED, ledger copilot, live progress.

---

## ✅ Done this session
- **Cross-platform fixes** — sandbox cobc paths win32-only; SSL off for local/docker postgres; POSIX upload commands (`./legacy`, `python3`).
- **Docker** — `docker compose up` runs app + worker + postgres; migration + demo verified.
- **Removed all placeholder/mock data** — deleted `lib/mock.ts`, the fabricated investigation theater, the fake provenance trace, and mock fallbacks. UI is 100% live ledger.
- **#1 Re-verify arc** — `POST /api/runs/[id]/reverify` + `ReVerifyPanel`; upload a fix → fresh CERTIFIED run + confetti; drift chart shows recovery.
- **#2 Ledger copilot** — `POST /api/runs/[id]/ask`, NL→SQL→answer. Safety: denylist + single-statement + forced LIMIT + read-only transaction with timeout. `AskLedger` UI.
- **#3 Live pipeline progress** — `verification_runs.stage` column; worker stamps each phase; `WaitingView` real checklist.
- **#4 Sandbox hardening** — scrubbed env (no secret leak), ulimits (mem/CPU/filesize/procs), output cap, SIGKILL process group, opt-in `unshare -n`.
- **CERTIFIED celebration** — ribbon confetti + seal glow, reduced-motion safe.
- **DB unification** — `lib/db.ts` + `scripts/migrate.ts` prefer `DATABASE_URL` so app + worker share ONE cluster (Aurora in prod); IAM/OIDC is fallback.
- **`ARCHITECTURE.md`** — mermaid diagram + DB wiring + pipeline/sandbox/copilot docs (submission asset).

---

## 🔴 Hackathon submission — critical path (deadline Jun 29, 5pm PT)
- [x] **Aurora connection** — `DB_TARGET=aurora` IAM path (PR #7); app + worker share one cluster.
- [x] **Migrate Aurora** — `npm run db:migrate` ran against Aurora; `stage` column added (PR #7).
- [x] **Real demo run on Aurora** — `pipeline:demo` → NOT_CERTIFIED, served via `npm run dev` (PR #7).
- [x] **Text writeup** — `SUBMISSION.tex` (full project report). Plain-text Devpost copy also drafted.
- [ ] **AWS console screenshot** — capture the Aurora cluster / a run in the RDS console (required asset).
- [ ] **Deploy to Vercel** — currently **FAILING** (red check on PR #7). Fix env (refresh OIDC token or set `DB_TARGET=aurora` + Aurora creds), redeploy, capture public URL + Team ID (`team_cv3eK9a0CMgLSlNGOGgN7tj0`). **Top blocker — no live URL = can't submit.**
- [ ] **AWS credits request — by Jun 26, 12pm PT** (hard sub-deadline, imminent).
- [ ] **<3-min demo video** — problem, audience, working app footage, which AWS DB + how it's used.
- [ ] **Paste writeup into Devpost** — from `SUBMISSION.tex`; set track = Monetizable B2B App, DB = Aurora PostgreSQL.
- [ ] (bonus) Build blog/video with #H0Hackathon — up to +0.6.

## 🟠 Product hardening
- [x] **#5 Decouple upload filenames** — `verify/new` derives the run command from the actual uploaded entry file (`.cbl`/`.cob`, `.py`); manual edits are preserved. Validated: oddly-named files run end-to-end.
- [x] **#6 Determinism test** — `npm test` (`scripts/test-determinism.ts`): demo run → asserts NOT_CERTIFIED, diverging count in band, finding on `final_amount`. Requires the stack running.
- [ ] **Re-verify forks instead of mutates** — DEFERRED: forking would break the single-project drift-recovery chart (the demo's payoff). Current workaround: reset the demo project (see below).
- [ ] **Clean up stale broken projects** — old `COBOL → Python Migration` rows carry POSIX-broken `&& legacy` commands; they fail if clicked (docker-local data; new uploads are correct).

## 🟡 Future work (post-hackathon)
- [ ] **Deploy worker to Fargate** — currently local; containerize per `Dockerfile.worker` for always-on.
- [ ] **Network isolation by default** — make `unshare -n` (or a locked-down network namespace) the default once the worker host grants the capability.
- [ ] **Richer SQL analytics** — divergence heatmap, severity-trend window functions beyond the drift line.
- [ ] **Function-level + HTTP-service comparison contracts** — v1 is black-box CSV only.
- [ ] **Multi-file / multi-module migrations** — current demo is single legacy + single migrated.
- [ ] **Auth + multi-tenant projects** — no auth today.
- [ ] **Streaming explain** — per-finding LLM explanation streamed to UI as it completes.
- [ ] **Configurable input generators** — beyond the interest/payroll schema.

---

## Run it
```
docker compose --env-file <env-with-keys> up -d --build   # app + worker + postgres
# migrate (host → docker db):
DATABASE_URL='postgres://parity:parity@localhost:5432/parity' npx tsx scripts/migrate.ts
```
Open http://localhost:3000 → /verify/new → "Use demo".
Reset demo to pristine NOT_CERTIFIED:
```
docker exec parity-db-1 psql -U parity -d parity \
  -c "UPDATE projects SET upload_dir=NULL, comparison_contract=NULL WHERE name='COBOL Interest & Payroll';"
```

## Notes
- Engine edits (`engine/*`, `lib/*` used by worker) need `docker compose up -d --build worker`. App/UI edits are live via mount.
- Env: `DATABASE_URL` (unified), `OPENAI_API_KEY` (explain + copilot). `.env.local` markdown fence + expired OIDC token already cleaned; backup at `.env.local.bak`.
