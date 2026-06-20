import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();
  const [run] = await sql`
    INSERT INTO verification_runs (project_id, status)
    VALUES (${projectId}, 'queued')
    RETURNING id
  `;
  return NextResponse.json({ runId: run.id });
}
