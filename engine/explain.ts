import OpenAI from 'openai';
import sql from '../lib/db.js';

const openai = new OpenAI(); // reads OPENAI_API_KEY from env

interface Finding {
  id: string;
  field_name: string;
  divergence_rate: number;
  max_abs_delta: number;
  diverging_count: number;
  total_count: number;
}

interface Sample {
  inputs: Record<string, string>;
  legacy_value: string;
  migrated_value: string;
  delta: string;
}

function buildPrompt(
  srcLang: string,
  tgtLang: string,
  finding: Finding,
  samples: Sample[]
): string {
  const rateStr = (Number(finding.divergence_rate) * 100).toFixed(4);
  const rows = samples
    .map((s, i) => {
      const inputStr = Object.entries(s.inputs)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return `${i + 1}. [${inputStr}]  ${srcLang}=${s.legacy_value}  ${tgtLang}=${s.migrated_value}  delta=${s.delta}`;
    })
    .join('\n');

  return `You are auditing a code migration from ${srcLang} to ${tgtLang}.

Field "${finding.field_name}" diverges in ${finding.diverging_count} of ${finding.total_count} test cases (${rateStr}%).
Maximum absolute delta: ${finding.max_abs_delta}.

Diverging examples (${srcLang} is the oracle / ground truth):
${rows}

Identify the root cause and how to fix it.

Respond in JSON with exactly two keys:
{
  "explanation": "<single most likely root cause, 1-3 sentences>",
  "suggested_fix": "<concrete code change for the ${tgtLang} implementation, with a short snippet>"
}`;
}

function parseResponse(text: string): { explanation: string; suggested_fix: string } {
  const match = text.match(/\{[\s\S]*?"explanation"[\s\S]*?"suggested_fix"[\s\S]*?\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        explanation: String(parsed.explanation ?? ''),
        suggested_fix: String(parsed.suggested_fix ?? ''),
      };
    } catch {}
  }
  return { explanation: text.slice(0, 1000), suggested_fix: 'See explanation.' };
}

export async function explain(runId: string, srcLang: string, tgtLang: string): Promise<void> {
  const findings = await sql<Finding[]>`
    SELECT id, field_name, divergence_rate, max_abs_delta, diverging_count, total_count
    FROM findings WHERE run_id = ${runId} AND explanation IS NULL
  `;

  if (findings.length === 0) return;

  console.log(`[explain] ${findings.length} finding(s) to explain`);

  for (const f of findings) {
    const samples = (await sql`
      SELECT tc.inputs, fd.legacy_value, fd.migrated_value, fd.delta
      FROM field_diffs fd
      JOIN test_cases tc ON tc.id = fd.test_case_id
      WHERE fd.run_id = ${runId}
        AND fd.field_name = ${f.field_name}
        AND fd.is_match = false
      ORDER BY fd.delta DESC NULLS LAST
      LIMIT 8
    `) as unknown as Sample[];

    console.log(`[explain] calling LLM for field "${f.field_name}"...`);

    const prompt = buildPrompt(srcLang, tgtLang, f, samples);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? '';
    const { explanation, suggested_fix } = parseResponse(text);

    await sql`
      UPDATE findings SET explanation = ${explanation}, suggested_fix = ${suggested_fix}
      WHERE id = ${f.id}
    `;

    console.log(`[explain] ✓ "${f.field_name}" explanation stored`);
  }
}
