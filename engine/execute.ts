import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import sql from '../lib/db.js';
import { createSandbox, createSandboxFromDir, runCommand, runShellCommand } from './sandbox.js';
import type { TestCaseRecord } from './generate.js';

export interface ProgramOutput {
  [key: string]: string;
}

export interface UploadConfig {
  legacyDir: string;
  migratedDir: string;
  legacyCmd: string;
  migratedCmd: string;
  outputFields: string[];
}

// Stages 2–3: execute legacy oracle and migrated program.
// Demo mode (no uploadConfig): compiles COBOL then runs Python against fixed fields.
// Upload mode (uploadConfig present): copies user files, runs user shell commands, parses any output fields.
export async function executePrograms(
  runId: string,
  testCases: TestCaseRecord[],
  inputsPath: string,
  fixturesDir: string,
  uploadConfig?: UploadConfig
): Promise<{
  legacyOutputs: Map<number, ProgramOutput>;
  migratedOutputs: Map<number, ProgramOutput>;
  outputFields: string[];
}> {
  const isWindows = process.platform === 'win32';

  if (uploadConfig) {
    // ── Upload mode ─────────────────────────────────────────────────────────
    const { legacyDir, migratedDir, legacyCmd, migratedCmd, outputFields } = uploadConfig;

    // Legacy
    const { dir: legacySandbox, cleanup: cleanLegacy } = await createSandboxFromDir(legacyDir, [
      { src: inputsPath, dest: 'inputs.csv' },
    ]);
    const legacyStart = Date.now();
    const legacyResult = await runShellCommand(legacySandbox, legacyCmd);
    const legacyExecMs = Date.now() - legacyStart;
    if (legacyResult.exitCode !== 0) {
      await cleanLegacy();
      throw new Error(`Legacy run failed:\n${legacyResult.stderr}`);
    }
    const legacyCsv = await readFile(join(legacySandbox, 'legacy_outputs.csv'), 'utf8').catch(() => {
      throw new Error('Legacy program did not write legacy_outputs.csv');
    });
    await cleanLegacy();

    // Migrated
    const { dir: migratedSandbox, cleanup: cleanMigrated } = await createSandboxFromDir(migratedDir, [
      { src: inputsPath, dest: 'inputs.csv' },
    ]);
    const migratedStart = Date.now();
    const migratedResult = await runShellCommand(migratedSandbox, migratedCmd);
    const migratedExecMs = Date.now() - migratedStart;
    if (migratedResult.exitCode !== 0) {
      await cleanMigrated();
      throw new Error(`Migrated run failed:\n${migratedResult.stderr}`);
    }
    const migratedCsv = await readFile(join(migratedSandbox, 'migrated_outputs.csv'), 'utf8').catch(() => {
      throw new Error('Migrated program did not write migrated_outputs.csv');
    });
    await cleanMigrated();

    const legacyRows = parse(legacyCsv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    const migratedRows = parse(migratedCsv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

    const legacyOutputs = new Map<number, ProgramOutput>(
      legacyRows.map((r) => [parseInt(r.seq, 10), Object.fromEntries(outputFields.map((f) => [f, r[f] ?? '']))])
    );
    const migratedOutputs = new Map<number, ProgramOutput>(
      migratedRows.map((r) => [parseInt(r.seq, 10), Object.fromEntries(outputFields.map((f) => [f, r[f] ?? '']))])
    );

    // Insert legacy_runs
    const legacyPerCase = Math.round(legacyExecMs / testCases.length) || null;
    const legacyRunRows = testCases
      .filter((tc) => legacyOutputs.has(tc.seq))
      .map((tc) => ({ test_case_id: tc.id, outputs: legacyOutputs.get(tc.seq)!, exec_ms: legacyPerCase }));
    const BATCH = 1000;
    for (let i = 0; i < legacyRunRows.length; i += BATCH) {
      await sql`INSERT INTO legacy_runs ${sql(legacyRunRows.slice(i, i + BATCH), 'test_case_id', 'outputs', 'exec_ms')}`;
    }

    // Insert migrated_runs
    const migratedPerCase = Math.round(migratedExecMs / testCases.length) || null;
    const migratedRunRows = testCases
      .filter((tc) => migratedOutputs.has(tc.seq))
      .map((tc) => ({ test_case_id: tc.id, outputs: migratedOutputs.get(tc.seq)!, exec_ms: migratedPerCase }));
    for (let i = 0; i < migratedRunRows.length; i += BATCH) {
      await sql`INSERT INTO migrated_runs ${sql(migratedRunRows.slice(i, i + BATCH), 'test_case_id', 'outputs', 'exec_ms')}`;
    }

    return { legacyOutputs, migratedOutputs, outputFields };
  }

  // ── Demo mode (COBOL + Python) ────────────────────────────────────────────
  const pythonCmd = isWindows ? 'python' : 'python3';
  const demoFields = ['final_amount', 'net_pay'];

  // Stage 2: COBOL oracle
  const { dir: cobolDir, cleanup: cleanCobol } = await createSandbox([
    { src: join(fixturesDir, 'legacy.cbl'), dest: 'legacy.cbl' },
    { src: inputsPath, dest: 'inputs.csv' },
  ]);

  const legacyBin = isWindows ? join(cobolDir, 'legacy.exe') : './legacy';
  const compileResult = await runCommand(cobolDir, ['cobc', '-x', '-free', '-o', 'legacy', 'legacy.cbl']);
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

  // Stage 3: Python migration
  const { dir: pyDir, cleanup: cleanPy } = await createSandbox([
    { src: join(fixturesDir, 'migrated.py'), dest: 'migrated.py' },
    { src: inputsPath, dest: 'inputs.csv' },
  ]);

  const pyStart = Date.now();
  const pyRunResult = await runCommand(pyDir, [pythonCmd, 'migrated.py', 'inputs.csv', 'migrated_outputs.csv']);
  const pyExecMs = Date.now() - pyStart;
  if (pyRunResult.exitCode !== 0) {
    await cleanPy();
    throw new Error(`Python run failed:\n${pyRunResult.stderr}`);
  }

  const migratedCsv = await readFile(join(pyDir, 'migrated_outputs.csv'), 'utf8');
  await cleanPy();

  const legacyRows = parse(legacyCsv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const migratedRows = parse(migratedCsv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  const legacyOutputs = new Map<number, ProgramOutput>(
    legacyRows.map((r) => [parseInt(r.seq, 10), Object.fromEntries(demoFields.map((f) => [f, r[f] ?? '']))])
  );
  const migratedOutputs = new Map<number, ProgramOutput>(
    migratedRows.map((r) => [parseInt(r.seq, 10), Object.fromEntries(demoFields.map((f) => [f, r[f] ?? '']))])
  );

  const BATCH = 1000;
  const legacyPerCase = Math.round(legacyExecMs / testCases.length) || null;
  const legacyRunRows = testCases
    .filter((tc) => legacyOutputs.has(tc.seq))
    .map((tc) => ({ test_case_id: tc.id, outputs: legacyOutputs.get(tc.seq)!, exec_ms: legacyPerCase }));
  for (let i = 0; i < legacyRunRows.length; i += BATCH) {
    await sql`INSERT INTO legacy_runs ${sql(legacyRunRows.slice(i, i + BATCH), 'test_case_id', 'outputs', 'exec_ms')}`;
  }

  const pyPerCase = Math.round(pyExecMs / testCases.length) || null;
  const migratedRunRows = testCases
    .filter((tc) => migratedOutputs.has(tc.seq))
    .map((tc) => ({ test_case_id: tc.id, outputs: migratedOutputs.get(tc.seq)!, exec_ms: pyPerCase }));
  for (let i = 0; i < migratedRunRows.length; i += BATCH) {
    await sql`INSERT INTO migrated_runs ${sql(migratedRunRows.slice(i, i + BATCH), 'test_case_id', 'outputs', 'exec_ms')}`;
  }

  return { legacyOutputs, migratedOutputs, outputFields: demoFields };
}
