import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const rows = await sql`
    SELECT
      a.id, a.seq, a.kind, a.summary, a.detail, a.created_at,
      COALESCE(
        json_agg(json_build_object(
          'id', q.id, 'question', q.question, 'sql', q.sql,
          'row_count', q.row_count, 'result_sample', q.result_sample
        )) FILTER (WHERE q.id IS NOT NULL),
        '[]'
      ) AS queries
    FROM agent_steps a
    LEFT JOIN agent_queries q ON q.step_id = a.id
    WHERE a.run_id = ${runId}
    GROUP BY a.id
    ORDER BY a.seq ASC
  `;
  return NextResponse.json(rows);
}
