import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const [row] = await sql`
    SELECT
      vr.*,
      p.name AS project_name, p.source_language, p.target_language,
      c.verdict AS cert_verdict, c.issued_at, c.finding_count, c.coverage_summary
    FROM verification_runs vr
    JOIN projects p ON p.id = vr.project_id
    LEFT JOIN certifications c ON c.run_id = vr.id
    WHERE vr.id = ${runId}
  `;
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}
