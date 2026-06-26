/**
 * Determinism smoke test for the flagship demo.
 *
 * Guards the core promise: the seeded COBOL->Python rounding bug must produce a
 * NOT_CERTIFIED verdict on every run, localized to `final_amount`, with a
 * diverging-input count in the expected band.
 *
 * Requires the stack running (app on BASE_URL, worker polling, db reachable).
 *   BASE_URL=http://localhost:3000 npx tsx scripts/test-determinism.ts
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const TIMEOUT_MS = 90_000;
const POLL_MS = 2_000;
// Demo is 10,050 inputs; the rounding bug diverges ~1% of final_amount. Allow a band.
const MIN_DIVERGING = 50;
const MAX_DIVERGING = 200;

function fail(msg: string): never {
  console.error(`✗ FAIL: ${msg}`);
  process.exit(1);
}

async function post(path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) fail(`POST ${path} -> ${res.status}`);
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) fail(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`[determinism] target ${BASE}`);

  const { projectId } = await post('/api/projects/demo');
  if (!projectId) fail('no projectId from /api/projects/demo');

  const { runId } = await post('/api/runs', { projectId });
  if (!runId) fail('no runId from /api/runs');
  console.log(`[determinism] run ${runId} queued`);

  const deadline = Date.now() + TIMEOUT_MS;
  let run: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    run = await get(`/api/runs/${runId}`);
    if (run.status === 'completed' || run.status === 'failed') break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if (run.status !== 'completed') fail(`run did not complete (status=${run.status}, error=${run.error ?? ''})`);
  if (run.verdict !== 'NOT_CERTIFIED') fail(`expected NOT_CERTIFIED, got ${run.verdict}`);

  const diverging = Number(run.diverging_input_count);
  if (!(diverging >= MIN_DIVERGING && diverging <= MAX_DIVERGING)) {
    fail(`diverging_input_count ${diverging} outside [${MIN_DIVERGING}, ${MAX_DIVERGING}]`);
  }

  const findings = (await get(`/api/runs/${runId}/findings`)) as { field_name: string }[];
  if (!findings.some((f) => f.field_name === 'final_amount')) {
    fail('no finding on field final_amount');
  }

  console.log(`✓ PASS: NOT_CERTIFIED, ${diverging} diverging inputs, finding on final_amount`);
  process.exit(0);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
