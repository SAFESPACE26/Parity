import { join } from 'node:path';
import sql from '../lib/db.js';
import { runPipeline } from './pipeline.js';

const DEMO_PROJECT_NAME = 'COBOL Interest & Payroll';
const FIXTURES_DIR = join(process.cwd(), 'fixtures', 'cobol-interest-payroll');

async function seedDemo(): Promise<{ projectId: string }> {
  let [row] = await sql<{ id: string }[]>`
    SELECT id FROM projects WHERE name = ${DEMO_PROJECT_NAME}
  `;
  if (!row) {
    [row] = await sql<{ id: string }[]>`
      INSERT INTO projects (name, source_language, target_language)
      VALUES (${DEMO_PROJECT_NAME}, 'COBOL', 'Python')
      RETURNING id
    `;
  }
  const projectId = row.id;

  for (const name of ['interest_calc', 'payroll']) {
    const [existing] = await sql`SELECT id FROM modules WHERE project_id = ${projectId} AND name = ${name}`;
    if (!existing) {
      await sql`INSERT INTO modules (project_id, name) VALUES (${projectId}, ${name})`;
    }
  }

  return { projectId };
}

async function main() {
  console.log('Parity — pipeline CLI (M3: explain + certify)');
  console.log('Fixtures:', FIXTURES_DIR);

  const { projectId } = await seedDemo();

  console.log('Project ID:', projectId);

  const [run] = await sql<{ id: string }[]>`
    INSERT INTO verification_runs (project_id, status)
    VALUES (${projectId}, 'queued')
    RETURNING id
  `;
  const runId = run.id;
  console.log('Run ID:', runId);
  console.log('Starting pipeline…');

  const result = await runPipeline(runId, projectId, {
    fixturesDir: FIXTURES_DIR,
    inputCount: 10000,
  });

  console.log('\n── Results ──────────────────────────────');
  console.log(`Inputs generated:      ${10050}`);
  console.log(`Fields checked:        ${result.fieldsChecked}`);
  console.log(`Diverging inputs:      ${result.divergingInputCount}`);
  console.log(`Findings:              ${result.findingCount}`);
  console.log(`Verdict:               ${result.verdict}`);

  // Print findings + LLM explanations
  const findings = await sql`
    SELECT field_name, diverging_count, total_count, divergence_rate, max_abs_delta, severity, explanation, suggested_fix
    FROM findings WHERE run_id = ${runId}
    ORDER BY diverging_count DESC
  `;

  if (findings.length > 0) {
    console.log('\nFindings:');
    for (const f of findings) {
      const rate = (Number(f.divergence_rate) * 100).toFixed(4);
      console.log(
        `  ${f.field_name}: ${f.diverging_count}/${f.total_count} diverging (${rate}%), ` +
        `max_delta=$${f.max_abs_delta}, severity=${f.severity}`
      );
      if (f.explanation) {
        console.log(`  Explanation: ${f.explanation}`);
      }
      if (f.suggested_fix) {
        console.log(`  Fix: ${f.suggested_fix}`);
      }
    }
  }

  console.log('\nRun ID for inspection:', runId);
  await sql.end();
}

main().catch((err) => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
