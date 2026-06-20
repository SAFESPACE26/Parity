# Parity — Next Session Notes

## Where we left off

**Branch:** `feature/backend`  
**Last completed:** M4 — all API routes live and verified against Aurora.

### Done this session
- **M3 complete:** `engine/explain.ts`, `engine/pipeline.ts` (certify), `engine/worker.ts` all written and validated end-to-end. Pipeline runs `npm run pipeline:demo` → 10,050 inputs → COBOL compiles → Python runs → 2 findings → NOT_CERTIFIED verdict → LLM explanations stored. Deterministic every run.
- **M4 complete:** 11 API routes created under `app/api/`, TypeScript clean, all smoke-tested against live Aurora data:
  - `POST /api/projects` + `POST /api/projects/demo`
  - `POST /api/runs`, `GET /api/runs/[id]`
  - `GET /api/runs/[id]/findings`, `/diffs`, `/coverage`, `/certification`, `/agent`
  - `POST /api/runs/[id]/ask` (501 stub — M5)
  - `GET /api/projects/[id]/runs`

### Key fixes made
- `lib/db.ts` — only uses Aurora IAM/OIDC path when `process.env.VERCEL` is set; falls through to `DATABASE_URL` (Neon) for local dev.
- `engine/explain.ts` — switched from Anthropic SDK to OpenAI (`gpt-4o-mini`). Uses `OPENAI_API_KEY`.

---

## Next milestone: M5 — Wire frontend to live data

Replace all `lib/mock.ts` imports in the page files with real `fetch()` calls to the API routes above.

### Files to update

**`app/projects/page.tsx`**
- Currently reads from `projects` in `lib/mock.ts`
- Replace with: `fetch('/api/projects')` → map rows to the same shape the component expects
- Fields needed: `id`, `name`, `source_language`, `target_language`, `run_id`, `verdict`, `avg_divergence_rate`, `completed_at`
- Make it a server component (no `"use client"`) — just `async function Dashboard()`

**`app/runs/[id]/page.tsx`**
- Currently reads from `runMeta`, `fieldBars`, `spineRows`, `trajectory`, `suggestedFix` in `lib/mock.ts`
- The page is already `"use client"` with a polling pattern — keep that
- Poll `GET /api/runs/[id]` every 2s while `status === 'running'` or `status === 'queued'`; stop when `completed` or `failed`
- On completion, fetch `GET /api/runs/[id]/findings`, `/coverage`, `/certification`, `/projects/[projectId]/runs`
- Wire the verdict seal, stats band, findings list, and drift chart to real data
- The analytics section ("Computed live from the Aurora ledger") should use `/coverage` for the bar chart and `/projects/[id]/runs` for the drift line

**`app/runs/[id]/diffs/page.tsx`**
- Currently reads from mock
- Replace with `fetch('/api/runs/[id]/diffs?field=X&onlyMismatches=true&limit=50&offset=0')`
- Keep the field filter and onlyMismatches toggle wired to query params

**`app/verify/new/page.tsx`**
- The "Use demo" button should `POST /api/projects/demo` then `POST /api/runs` with the returned `projectId`
- On success, redirect to `/runs/[runId]?running=1`
- Start `npm run worker` in a separate terminal before clicking Run so the queued run gets picked up

### Running the full demo flow
1. `npm run dev` — Next.js frontend
2. `npm run worker` — verification worker (separate terminal)
3. Open `/verify/new` → click "Use demo" → redirects to run page → watch it go live

### After M5 — M6: Deploy (required to qualify)
- Push to Vercel (`vercel --prod`)
- Worker runs locally for the demo (or containerize for Fargate)
- Needs `DATABASE_URL` + `OPENAI_API_KEY` in Vercel env vars
- Submission assets: ≤3-min demo video, architecture diagram, Aurora screenshot, Vercel URL + Team ID

---

## Env vars in `.env.local`
- `DATABASE_URL` — Neon (used for local dev)
- `OPENAI_API_KEY` — for LLM explain stage (gpt-4o-mini)
- `PGHOST` / `AWS_ROLE_ARN` / `VERCEL_OIDC_TOKEN` — Aurora IAM auth (only active when `VERCEL=1`)

## Useful run IDs (already in Aurora)
- Completed demo run: `295766e3-694e-4edd-b000-90ad9d5198ae` — NOT_CERTIFIED, 2 findings
