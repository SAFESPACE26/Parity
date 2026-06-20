import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  const rows = await sql`
    SELECT p.id, p.name, p.source_language, p.target_language, p.created_at,
      r.id AS run_id, r.status, r.verdict, r.completed_at,
      c.finding_count,
      (SELECT ROUND(AVG(divergence_rate)::numeric, 4) FROM findings WHERE run_id = r.id) AS avg_divergence_rate
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT id, status, verdict, completed_at
      FROM verification_runs
      WHERE project_id = p.id
      ORDER BY created_at DESC
      LIMIT 1
    ) r ON true
    LEFT JOIN certifications c ON c.run_id = r.id
    ORDER BY p.created_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, sourceLanguage, targetLanguage } = await req.json();
  const [project] = await sql`
    INSERT INTO projects (name, source_language, target_language)
    VALUES (${name}, ${sourceLanguage}, ${targetLanguage})
    RETURNING id
  `;
  const projectId = project.id;
  for (const moduleName of ['interest_calc', 'payroll']) {
    await sql`INSERT INTO modules (project_id, name) VALUES (${projectId}, ${moduleName})`;
  }
  return NextResponse.json({ projectId });
}
