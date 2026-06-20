import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import sql from '../lib/db.js';
import { createSandbox, runCommand } from './sandbox.js';
import type { TestCaseRecord } from './generate.js';

export interface ProgramOutput {
  final_amount: string;
  net_pay: string;
  [key: string]: string;
}

// Stage 2: compile + run COBOL oracle; Stage 3: run Python migration.
// Returns outputs keyed by seq for compare stage.
export async function executePrograms(
  runId: string,
  testCases: TestCaseRecord[],
  inputsPath: string,
  fixturesDir: string
): Promise<{
  legacyOutputs: Map<number, ProgramOutput>;
  migratedOutputs: Map<number, ProgramOutput>;
}> {
  const isWindows = process.platform === 'win32';
  const pythonCmd = isWindows ? 'python' : 'python3';

  // ── Stage 2: COBOL oracle ────────────────────────────────────────────────
  const { dir: cobolDir, cleanup: cleanCobol } = await createSandbox([
    { src: join(fixturesDir, 'legacy.cbl'), dest: 'legacy.cbl' },
    { src: inputsPath, dest: 'inputs.csv' },
  ]);

  // On Windows, cobc produces legacy.exe; use an absolute path so spawn resolves
  // it in the sandbox dir rather than searching PATH.
  const legacyBin = isWindows ? join(cobolDir, 'legacy.exe') : './legacy';

  const compileResult = await runCommand(
    cobolDir,
    ['cobc', '-x', '-free', '-o', 'legacy', 'legacy.cbl']
  );
  if (compileResult.exitCode !== 0) {
    await cleanCobol();
    throw new Error(`COBOL compile failed:\n${compileResult.stderr}`);
  }

  const legacyStart = Date.now();
  const legacyRunResult = await runCommand(cobolDir, [legacyBin]);
  const legacyExecMs = Date.now() - legacyStart;

  if (legacyRunResult.exitCode !== 0) {
    await cleanCobol();
    throw new Error(`COBOL run failed:\n${legacyRunResult.stderr}`);
  }

  const legacyCsv = await readFile(join(cobolDir, 'legacy_outputs.csv'), 'utf8');
  await cleanCobol();

  const legacyRows = parse(legacyCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<{ seq: string; final_amount: string; net_pay: string }>;

  const legacyOutputs = new Map<number, ProgramOutput>(
    legacyRows.map((r) => [parseInt(r.seq, 10), { final_amount: r.final_amount, net_pay: r.net_pay }])
  );

  // Insert legacy_runs
  const legacyPerCase = Math.round(legacyExecMs / testCases.length) || null;
  const legacyRunRows = testCases
    .filter((tc) => legacyOutputs.has(tc.seq))
    .map((tc) => ({
      test_case_id: tc.id,
      outputs: legacyOutputs.get(tc.seq)!,
      exec_ms: legacyPerCase,
    }));

  const BATCH = 1000;
  for (let i = 0; i < legacyRunRows.length; i += BATCH) {
    await sql`INSERT INTO legacy_runs ${sql(legacyRunRows.slice(i, i + BATCH), 'test_case_id', 'outputs', 'exec_ms')}`;
  }

  // ── Stage 3: Python migration ─────────────────────────────────────────────
  const { dir: pyDir, cleanup: cleanPy } = await createSandbox([
    { src: join(fixturesDir, 'migrated.py'), dest: 'migrated.py' },
    { src: inputsPath, dest: 'inputs.csv' },
  ]);

  const pyStart = Date.now();
  const pyRunResult = await runCommand(
    pyDir,
    [pythonCmd, 'migrated.py', 'inputs.csv', 'migrated_outputs.csv']
  );
  const pyExecMs = Date.now() - pyStart;

  if (pyRunResult.exitCode !== 0) {
    await cleanPy();
    throw new Error(`Python run failed:\n${pyRunResult.stderr}`);
  }

  const migratedCsv = await readFile(join(pyDir, 'migrated_outputs.csv'), 'utf8');
  await cleanPy();

  const migratedRows = parse(migratedCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<{ seq: string; final_amount: string; net_pay: string }>;

  const migratedOutputs = new Map<number, ProgramOutput>(
    migratedRows.map((r) => [parseInt(r.seq, 10), { final_amount: r.final_amount, net_pay: r.net_pay }])
  );

  // Insert migrated_runs
  const pyPerCase = Math.round(pyExecMs / testCases.length) || null;
  const migratedRunRows = testCases
    .filter((tc) => migratedOutputs.has(tc.seq))
    .map((tc) => ({
      test_case_id: tc.id,
      outputs: migratedOutputs.get(tc.seq)!,
      exec_ms: pyPerCase,
    }));

  for (let i = 0; i < migratedRunRows.length; i += BATCH) {
    await sql`INSERT INTO migrated_runs ${sql(migratedRunRows.slice(i, i + BATCH), 'test_case_id', 'outputs', 'exec_ms')}`;
  }

  return { legacyOutputs, migratedOutputs };
}
