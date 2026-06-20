import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const rows = await sql`
    SELECT f.*, m.name AS module_name
    FROM findings f
    LEFT JOIN modules m ON m.id = f.module_id
    WHERE f.run_id = ${runId}
    ORDER BY f.diverging_count DESC
  `;
  return NextResponse.json(rows);
}
