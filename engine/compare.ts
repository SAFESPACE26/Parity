import sql from '../lib/db.js';
import type { TestCaseRecord } from './generate.js';
import type { ProgramOutput } from './execute.js';

function severity(divergenceRate: number): string {
  if (divergenceRate > 0.1) return 'critical';
  if (divergenceRate > 0.01) return 'high';
  if (divergenceRate > 0.001) return 'medium';
  return 'low';
}

// Stages 4–5: equivalence relation, masking, diffing, aggregation, findings.
export async function compare(
  runId: string,
  testCases: TestCaseRecord[],
  legacyOutputs: Map<number, ProgramOutput>,
  migratedOutputs: Map<number, ProgramOutput>,
  moduleMap: Record<string, string>,
  tolerance = 0,
  mask: string[] = [],
  outputFields: string[] = ['final_amount', 'net_pay']
): Promise<{ divergingInputCount: number; fieldsChecked: number }> {
  const maskSet = new Set(mask);

  type AggKey = string;
  const agg = new Map<AggKey, { divergingCount: number; totalCount: number; maxAbsDelta: number }>();

  const fieldDiffs: Array<{
    run_id: string;
    test_case_id: string;
    module_id: string | null;
    field_name: string;
    legacy_value: string;
    migrated_value: string;
    is_match: boolean;
    delta: number | null;
  }> = [];

  const divergingInputIds = new Set<string>();

  for (const tc of testCases) {
    const legacyOut = legacyOutputs.get(tc.seq);
    const migratedOut = migratedOutputs.get(tc.seq);
    if (!legacyOut || !migratedOut) continue;

    for (const field of outputFields) {
      const legacyVal = (legacyOut[field] ?? '').trim();
      const migratedVal = (migratedOut[field] ?? '').trim();
      const moduleId = moduleMap[field] ?? null;
      const aggKey: AggKey = `${field}:${moduleId ?? 'null'}`;

      let isMatch: boolean;
      let delta: number | null = null;

      if (maskSet.has(field)) {
        isMatch = true;
      } else {
        const lNum = parseFloat(legacyVal);
        const mNum = parseFloat(migratedVal);
        const rawDelta = Math.abs(lNum - mNum);
        delta = Math.round(rawDelta * 100) / 100;
        isMatch = tolerance === 0 ? legacyVal === migratedVal : rawDelta <= tolerance;
      }

      fieldDiffs.push({
        run_id: runId,
        test_case_id: tc.id,
        module_id: moduleId,
        field_name: field,
        legacy_value: legacyVal,
        migrated_value: migratedVal,
        is_match: isMatch,
        delta,
      });

      if (!isMatch) divergingInputIds.add(tc.id);

      const entry = agg.get(aggKey) ?? { divergingCount: 0, totalCount: 0, maxAbsDelta: 0 };
      entry.totalCount++;
      if (!isMatch) {
        entry.divergingCount++;
        if (delta !== null && delta > entry.maxAbsDelta) entry.maxAbsDelta = delta;
      }
      agg.set(aggKey, entry);
    }
  }

  const BATCH = 1000;
  for (let i = 0; i < fieldDiffs.length; i += BATCH) {
    await sql`
      INSERT INTO field_diffs ${sql(
        fieldDiffs.slice(i, i + BATCH),
        'run_id', 'test_case_id', 'module_id', 'field_name',
        'legacy_value', 'migrated_value', 'is_match', 'delta'
      )}
    `;
  }

  const findingRows = Array.from(agg.entries())
    .filter(([, v]) => v.divergingCount > 0)
    .map(([key, v]) => {
      const colonIdx = key.lastIndexOf(':');
      const fieldName = key.slice(0, colonIdx);
      const moduleIdRaw = key.slice(colonIdx + 1);
      const divergenceRate = v.divergingCount / v.totalCount;
      return {
        run_id: runId,
        module_id: moduleIdRaw === 'null' ? null : moduleIdRaw,
        field_name: fieldName,
        diverging_count: v.divergingCount,
        total_count: v.totalCount,
        divergence_rate: divergenceRate,
        max_abs_delta: v.maxAbsDelta,
        severity: severity(divergenceRate),
      };
    });

  if (findingRows.length > 0) {
    await sql`
      INSERT INTO findings ${sql(
        findingRows,
        'run_id', 'module_id', 'field_name', 'diverging_count',
        'total_count', 'divergence_rate', 'max_abs_delta', 'severity'
      )}
    `;
  }

  const fieldsChecked = fieldDiffs.length;
  const divergingInputCount = divergingInputIds.size;

  await sql`
    UPDATE verification_runs
    SET diverging_input_count = ${divergingInputCount},
        fields_checked        = ${fieldsChecked}
    WHERE id = ${runId}
  `;

  return { divergingInputCount, fieldsChecked };
}
