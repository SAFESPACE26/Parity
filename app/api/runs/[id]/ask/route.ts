import OpenAI from 'openai';
import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

// Ledger copilot: natural-language question -> read-only SQL over the equivalence
// ledger for ONE run -> rows + a short natural-language answer.
//
// Safety model (defense in depth, the LLM is never trusted):
//   1. denylist + single-statement check on the generated SQL
//   2. wrapped in an outer SELECT with a hard LIMIT
//   3. executed inside a READ ONLY transaction with a statement_timeout
// Even if (1)/(2) were bypassed, (3) makes writes impossible.

const openai = new OpenAI(); // OPENAI_API_KEY from env
const MODEL = 'gpt-4o-mini';
const ROW_CAP = 200;

const SCHEMA = `Tables (PostgreSQL), all scoped to a single run via run_id:
- verification_runs(id, project_id, status, input_count, fields_checked, diverging_input_count, verdict, started_at, completed_at, created_at)
- test_cases(id, run_id, seq, inputs jsonb)   -- inputs keys: principal, rate, term, gross, tax_rate (all text)
- field_diffs(id, run_id, test_case_id, module_id, field_name, legacy_value, migrated_value, is_match boolean, delta numeric)
- findings(id, run_id, module_id, field_name, diverging_count, total_count, divergence_rate, max_abs_delta, severity, explanation, suggested_fix)
- modules(id, name)
- certifications(id, run_id, verdict, certified_count, diverging_count, coverage_summary jsonb, issued_at)
field_diffs holds one row per (test_case, field); is_match=false means a divergence. legacy_value is the oracle/ground truth.
Join test_cases on field_diffs.test_case_id to read inputs, e.g. tc.inputs->>'principal'.`;

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|vacuum|comment|reindex|call|do|set|begin|commit|rollback)\b/i;

function extractSql(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  return s.replace(/;+\s*$/, '').trim();
}

function validateSelect(q: string): string | null {
  const lower = q.toLowerCase();
  if (!/^\s*(select|with)\b/.test(lower)) return 'Generated query is not a SELECT.';
  if (q.includes(';')) return 'Generated query has multiple statements.';
  if (q.includes('--') || q.includes('/*')) return 'Generated query contains comments.';
  if (FORBIDDEN.test(q)) return 'Generated query contains a forbidden keyword.';
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const { question } = await req.json().catch(() => ({ question: '' }));
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'Provide a "question" string.' }, { status: 400 });
  }

  const [run] = await sql<{ id: string }[]>`SELECT id FROM verification_runs WHERE id = ${runId}`;
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  // 1. NL -> SQL
  let genSql: string;
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            `You translate questions about a code-migration verification ledger into ONE read-only PostgreSQL query.\n${SCHEMA}\n\n` +
            `Rules:\n- Output ONLY the SQL, no prose, no markdown.\n- Exactly one SELECT (CTEs/WITH allowed). No semicolons.\n` +
            `- ALWAYS filter to this run: run_id = '${runId}' (alias accordingly on joins).\n` +
            `- Read-only only. Never write or modify.\n- Prefer aggregates/ordering; keep results under ${ROW_CAP} rows.`,
        },
        { role: 'user', content: question },
      ],
    });
    genSql = extractSql(completion.choices[0]?.message?.content ?? '');
  } catch (e) {
    return NextResponse.json({ error: `LLM error: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }

  const invalid = validateSelect(genSql);
  if (invalid) return NextResponse.json({ error: invalid, sql: genSql }, { status: 422 });

  // 2 + 3. Execute wrapped + capped, inside a read-only transaction with a timeout.
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql.begin(async (tx) => {
      await tx.unsafe('SET TRANSACTION READ ONLY');
      await tx.unsafe('SET LOCAL statement_timeout = 5000');
      return tx.unsafe(`SELECT * FROM (${genSql}) AS _q LIMIT ${ROW_CAP}`);
    })) as unknown as Record<string, unknown>[];
  } catch (e) {
    return NextResponse.json(
      { error: `Query failed: ${e instanceof Error ? e.message : String(e)}`, sql: genSql },
      { status: 422 }
    );
  }

  // Short natural-language answer grounded in the rows.
  let answer = '';
  try {
    const preview = JSON.stringify(rows.slice(0, 30));
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: 'Answer the question in 1-3 sentences using ONLY the provided rows. Cite concrete numbers. If rows are empty, say no matching records.' },
        { role: 'user', content: `Question: ${question}\nRows (JSON, may be truncated): ${preview}` },
      ],
    });
    answer = completion.choices[0]?.message?.content?.trim() ?? '';
  } catch {
    answer = '';
  }

  return NextResponse.json({ sql: genSql, rows, rowCount: rows.length, answer });
}
