import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'csv-stringify/sync';
import sql from '../lib/db.js';

export interface TestCaseRecord {
  id: string;
  seq: number;
  inputs: { principal: string; rate: string; term: string; gross: string; tax_rate: string };
}

function rand(min: number, max: number, decimals: number): string {
  return (min + Math.random() * (max - min)).toFixed(decimals);
}

export async function generate(
  runId: string,
  outputDir: string,
  n = 10000
): Promise<{ testCases: TestCaseRecord[]; inputsPath: string }> {
  const rows: Array<{
    seq: number;
    principal: string;
    rate: string;
    term: number;
    gross: string;
    tax_rate: string;
  }> = [];

  for (let i = 0; i < n; i++) {
    rows.push({
      seq: i,
      principal: rand(1000, 100000.99, 2),
      rate: rand(0.0001, 0.1500, 4),
      term: Math.floor(1 + Math.random() * 30),
      gross: rand(1000, 20000.99, 2),
      tax_rate: rand(0.1000, 0.3700, 4),
    });
  }

  // ~50 boundary cases: principal = odd int (1,3,...,99), rate = 0.0050, term = 1.
  // Produces principal * 1.005 = N.005 — a half-cent that COBOL rounds up (ROUNDED)
  // but Python float rounds down (banker's rounding on slightly-sub-0.005 float).
  for (let k = 0; k < 50; k++) {
    const N = 2 * k + 1;
    rows.push({
      seq: n + k,
      principal: N.toFixed(2),
      rate: '0.0050',
      term: 1,
      gross: (N * 1000).toFixed(2),
      tax_rate: '0.1050',
    });
  }

  const inputsPath = join(outputDir, 'inputs.csv');
  const csvContent = stringify(
    rows.map((r) => [r.seq, r.principal, r.rate, r.term, r.gross, r.tax_rate]),
    { header: true, columns: ['seq', 'principal', 'rate', 'term', 'gross', 'tax_rate'] }
  );
  await writeFile(inputsPath, csvContent, { encoding: 'utf8' });

  // Bulk insert test_cases in batches of 1 000 rows
  const BATCH = 1000;
  const inserted: { id: string; seq: number }[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      run_id: runId,
      seq: r.seq,
      inputs: {
        principal: r.principal,
        rate: r.rate,
        term: String(r.term),
        gross: r.gross,
        tax_rate: r.tax_rate,
      },
    }));
    const result = (await sql`
      INSERT INTO test_cases ${sql(batch, 'run_id', 'seq', 'inputs')} RETURNING id, seq
    `) as { id: string; seq: number }[];
    inserted.push(...result);
  }

  const idBySeq = new Map(inserted.map((r) => [r.seq, r.id]));
  const testCases: TestCaseRecord[] = rows.map((r) => ({
    id: idBySeq.get(r.seq)!,
    seq: r.seq,
    inputs: {
      principal: r.principal,
      rate: r.rate,
      term: String(r.term),
      gross: r.gross,
      tax_rate: r.tax_rate,
    },
  }));

  return { testCases, inputsPath };
}
