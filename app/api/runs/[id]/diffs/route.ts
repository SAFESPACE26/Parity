import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const { searchParams } = new URL(req.url);
  const field = searchParams.get('field') ?? '';
  const onlyMismatches = searchParams.get('onlyMismatches') === 'true';
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50', 10));
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const filters = [
    sql`fd.run_id = ${runId}`,
    ...(field ? [sql`fd.field_name = ${field}`] : []),
    ...(onlyMismatches ? [sql`fd.is_match = false`] : []),
  ];
  const where = filters.reduce((a, b) => sql`${a} AND ${b}`);

  const rows = await sql`
    SELECT fd.id, fd.field_name, fd.legacy_value, fd.migrated_value, fd.is_match, fd.delta,
      tc.seq, tc.inputs
    FROM field_diffs fd
    JOIN test_cases tc ON tc.id = fd.test_case_id
    WHERE ${where}
    ORDER BY tc.seq ASC, fd.field_name ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return NextResponse.json({ rows, limit, offset, field: field || null, onlyMismatches });
}
