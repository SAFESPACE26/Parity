import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const fields = await sql`
    SELECT
      fd.field_name,
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE fd.is_match = true) AS match_count,
      COUNT(*) FILTER (WHERE fd.is_match = false) AS mismatch_count,
      ROUND(
        COUNT(*) FILTER (WHERE fd.is_match = false)::numeric / NULLIF(COUNT(*), 0),
        4
      ) AS divergence_rate,
      MAX(ABS(fd.delta)) AS max_abs_delta,
      SUM(COUNT(*) FILTER (WHERE fd.is_match = false)) OVER (ORDER BY fd.field_name) AS cumulative_mismatches,
      SUM(COUNT(*)) OVER () AS grand_total
    FROM field_diffs fd
    WHERE fd.run_id = ${runId}
    GROUP BY fd.field_name
    ORDER BY divergence_rate DESC NULLS LAST
  `;

  const totalComparisons = fields.length > 0 ? Number(fields[0].grand_total) : 0;
  const totalMismatches = fields.reduce((sum: number, r) => sum + Number(r.mismatch_count), 0);

  return NextResponse.json({ fields, totalComparisons, totalMismatches });
}
