import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const rows = await sql`
    SELECT
      vr.id, vr.status, vr.verdict, vr.created_at, vr.completed_at,
      vr.input_count, vr.diverging_input_count,
      c.finding_count,
      c.coverage_summary,
      COALESCE(
        (SELECT ROUND(MAX(divergence_rate)::numeric, 4) FROM findings WHERE run_id = vr.id),
        0
      ) AS max_divergence_rate,
      ROW_NUMBER() OVER (ORDER BY vr.created_at ASC) AS run_number
    FROM verification_runs vr
    LEFT JOIN certifications c ON c.run_id = vr.id
    WHERE vr.project_id = ${projectId}
    ORDER BY vr.created_at ASC
  `;
  return NextResponse.json(rows);
}
