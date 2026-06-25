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
- [ ] **Aurora connection** — get `aws-apg-cerulean-feather` URL (password user or fresh IAM). Set `DATABASE_URL=postgresql://…rds.amazonaws.com:5432/<db>?sslmode=require` on **both** Vercel env and the worker.
- [ ] **Migrate Aurora** — `npm run db:migrate` against the Aurora `DATABASE_URL`.
- [ ] **One real demo run on Aurora** → **AWS console screenshot** (required submission asset).
- [ ] **Deploy to Vercel** — `vercel --prod`; confirm it reads live Aurora; capture the public URL + Team ID (`team_cv3eK9a0CMgLSlNGOGgN7tj0`).
- [ ] **AWS credits request — by Jun 26, 12pm PT** (hard sub-deadline).
- [ ] **<3-min demo video** — problem, audience, working app footage, which AWS DB + how it's used.
- [ ] **Text writeup** — features + "Aurora PostgreSQL" + track = Monetizable B2B App.
- [ ] (bonus) Build blog/video with #H0Hackathon — up to +0.6.

## 🟠 Product hardening (do if time before deadline)
- [ ] **#5 Decouple upload filenames** — upload command hardcodes `legacy.cbl`/`migrated.py`; derive from uploaded filename or detect entry file. Silent failure for real users otherwise.
- [ ] **#6 Determinism test** — automated: demo run → always NOT_CERTIFIED, ~100 `final_amount` divergences. Pin an exact count via boundary cases (currently drifts 99–111).
- [ ] **Re-verify forks instead of mutates** — re-verifying the demo project mutates it (stays "fixed"); fork to a new project so demos repeat without manual reset.
- [ ] **Clean up stale broken projects** — old `COBOL → Python Migration` rows carry POSIX-broken `&& legacy` commands; they fail if clicked.

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
