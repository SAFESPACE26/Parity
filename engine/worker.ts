import { join } from 'node:path';
import sql from '../lib/db.js';
import { runPipeline } from './pipeline.js';
import type { PipelineConfig } from './pipeline.js';

const DEMO_FIXTURES = join(process.cwd(), 'fixtures', 'cobol-interest-payroll');
const POLL_INTERVAL_MS = 3_000;

async function claimRun(): Promise<{ id: string; project_id: string } | null> {
  const [run] = await sql<{ id: string; project_id: string }[]>`
    UPDATE verification_runs
    SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM verification_runs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, project_id
  `;
  return run ?? null;
}

async function processRun(run: { id: string; project_id: string }): Promise<void> {
  console.log(`[worker] ▶ run ${run.id} (project ${run.project_id})`);

  const [project] = await sql<{ upload_dir: string | null; comparison_contract: { legacyCmd: string; migratedCmd: string; outputFields: string[] } | null }[]>`
    SELECT upload_dir, comparison_contract FROM projects WHERE id = ${run.project_id}
  `;

  let config: PipelineConfig;
  if (project?.upload_dir && project?.comparison_contract) {
    config = {
      uploadConfig: {
        legacyDir: join(project.upload_dir, 'legacy'),
        migratedDir: join(project.upload_dir, 'migrated'),
        legacyCmd: project.comparison_contract.legacyCmd,
        migratedCmd: project.comparison_contract.migratedCmd,
        outputFields: project.comparison_contract.outputFields,
      },
    };
  } else {
    config = { fixturesDir: DEMO_FIXTURES };
  }

  const result = await runPipeline(run.id, run.project_id, config);
  console.log(
    `[worker] ✓ run ${run.id} → ${result.verdict}  ` +
    `(${result.divergingInputCount} diverging inputs, ${result.findingCount} findings)`
  );
}

async function poll(): Promise<void> {
  console.log('[worker] poll loop started — waiting for queued runs...');
  while (true) {
    try {
      const run = await claimRun();
      if (run) {
        try {
          await processRun(run);
        } catch (err) {
          console.error(`[worker] ✗ run ${run.id} failed:`, err);
          await sql`
            UPDATE verification_runs
            SET status = 'failed', error = ${String(err)}
            WHERE id = ${run.id} AND status = 'running'
          `;
        }
      } else {
        await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error('[worker] poll error:', err);
      await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

process.on('SIGTERM', () => { console.log('[worker] SIGTERM — exiting'); process.exit(0); });
process.on('SIGINT',  () => { console.log('[worker] SIGINT — exiting');  process.exit(0); });

poll().catch((err) => { console.error('[worker] fatal:', err); process.exit(1); });
