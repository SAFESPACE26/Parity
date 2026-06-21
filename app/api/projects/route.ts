import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  const formData = await req.formData();

  const sourceLanguage = (formData.get('sourceLanguage') as string) ?? 'Unknown';
  const targetLanguage = (formData.get('targetLanguage') as string) ?? 'Unknown';
  const name = (formData.get('name') as string) || `${sourceLanguage} → ${targetLanguage} Migration`;
  const legacyCmd = (formData.get('legacyCmd') as string) ?? '';
  const migratedCmd = (formData.get('migratedCmd') as string) ?? '';
  const outputFieldsRaw = (formData.get('outputFields') as string) ?? '';
  const outputFields = outputFieldsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  const legacyFiles = formData.getAll('legacyFiles') as File[];
  const migratedFiles = formData.getAll('migratedFiles') as File[];

  const [project] = await sql`
    INSERT INTO projects (name, source_language, target_language)
    VALUES (${name}, ${sourceLanguage}, ${targetLanguage})
    RETURNING id
  `;
  const projectId = project.id as string;

  const uploadDir = join(process.cwd(), 'uploads', projectId);
  await mkdir(join(uploadDir, 'legacy'), { recursive: true });
  await mkdir(join(uploadDir, 'migrated'), { recursive: true });

  for (const file of legacyFiles) {
    await writeFile(join(uploadDir, 'legacy', file.name), Buffer.from(await file.arrayBuffer()));
  }
  for (const file of migratedFiles) {
    await writeFile(join(uploadDir, 'migrated', file.name), Buffer.from(await file.arrayBuffer()));
  }

  const contract = { legacyCmd, migratedCmd, outputFields };
  await sql`
    UPDATE projects
    SET upload_dir = ${uploadDir}, comparison_contract = ${contract as unknown as string}
    WHERE id = ${projectId}
  `;

  return NextResponse.json({ projectId });
}
