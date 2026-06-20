import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sql from '../lib/db.js';
import { generate } from './generate.js';
import { executePrograms } from './execute.js';
import { compare } from './compare.js';
import { explain } from './explain.js';

export interface PipelineConfig {
  fixturesDir: string;
  inputCount?: number;
  tolerance?: number;
  mask?: string[];
}

export interface PipelineResult {
  divergingInputCount: number;
  fieldsChecked: number;
  findingCount: number;
  verdict: 'CERTIFIED' | 'NOT_CERTIFIED';
}

export async function runPipeline(
  runId: string,
  projectId: string,
  config: PipelineConfig
): Promise<PipelineResult> {
  const { fixturesDir, inputCount = 10000, tolerance = 0, mask = [] } = config;

  await sql`
    UPDATE verification_runs
    SET status = 'running', started_at = now()
    WHERE id = ${runId}
  `;

  // Resolve module IDs for field → module mapping
  const modules = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM modules WHERE project_id = ${projectId}
  `;
  const moduleMap: Record<string, string> = {};
  for (const m of modules) {
    if (m.name === 'interest_calc') moduleMap['final_amount'] = m.id;
    if (m.name === 'payroll') moduleMap['net_pay'] = m.id;
  }

  // Resolve project languages for the LLM explain prompt
  const [project] = await sql<{ source_language: string; target_language: string }[]>`
    SELECT source_language, target_language FROM projects WHERE id = ${projectId}
  `;
  const srcLang = project?.source_language ?? 'COBOL';
  const tgtLang = project?.target_language ?? 'Python';

  const tempDir = await mkdtemp(join(tmpdir(), 'parity-inputs-'));
  try {
    // Stage 1 — generate inputs
    const { testCases, inputsPath } = await generate(runId, tempDir, inputCount);
    await sql`UPDATE verification_runs SET input_count = ${testCases.length} WHERE id = ${runId}`;

    // Stages 2–3 — execute legacy (oracle) + migrated
    const { legacyOutputs, migratedOutputs } = await executePrograms(
      runId, testCases, inputsPath, fixturesDir
    );

    // Stages 4–5 — compare + localize
    const { divergingInputCount, fieldsChecked } = await compare(
      runId, testCases, legacyOutputs, migratedOutputs, moduleMap, tolerance, mask
    );

    // Stage 6 — explain (LLM per finding)
    await explain(runId, srcLang, tgtLang);

    // Stage 7 — certify
    const findings = await sql`SELECT * FROM findings WHERE run_id = ${runId}`;
    const findingCount = findings.length;
    const verdict: 'CERTIFIED' | 'NOT_CERTIFIED' = findingCount > 0 ? 'NOT_CERTIFIED' : 'CERTIFIED';

    const perField: Record<string, { total: number; diverging: number; divergence_rate: number }> = {};
    for (const f of findings) {
      perField[f.field_name as string] = {
        total: Number(f.total_count),
        diverging: Number(f.diverging_count),
        divergence_rate: Number(f.divergence_rate),
      };
    }
    const coverageSummary = {
      input_count: testCases.length,
      fields_checked: fieldsChecked,
      per_field: perField,
    };

    await sql`
      INSERT INTO certifications (run_id, verdict, input_count, fields_checked, finding_count, coverage_summary)
      VALUES (${runId}, ${verdict}, ${testCases.length}, ${fieldsChecked}, ${findingCount}, ${coverageSummary as unknown as string})
    `;

    await sql`
      UPDATE verification_runs
      SET status = 'completed', verdict = ${verdict}, completed_at = now()
      WHERE id = ${runId}
    `;

    return { divergingInputCount, fieldsChecked, findingCount, verdict };
  } catch (err) {
    await sql`
      UPDATE verification_runs
      SET status = 'failed', error = ${String(err)}
      WHERE id = ${runId}
    `;
    throw err;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
