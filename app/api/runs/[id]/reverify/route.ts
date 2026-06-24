import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

// Re-verify: take a NOT_CERTIFIED run, apply an uploaded fix to the migrated side,
// and enqueue a fresh run on the SAME project so the drift chart shows the recovery
// (run N: NOT_CERTIFIED → run N+1: CERTIFIED).
const DEMO_FIXTURES = join(process.cwd(), 'fixtures', 'cobol-interest-payroll');
const POSIX_LEGACY_CMD = 'cobc -x -free -o legacy legacy.cbl && ./legacy';
const DEFAULT_OUTPUT_FIELDS = ['final_amount', 'net_pay'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;

  const [run] = await sql<{ project_id: string }[]>`
    SELECT project_id FROM verification_runs WHERE id = ${runId}
  `;
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const [project] = await sql<
    { upload_dir: string | null; comparison_contract: { legacyCmd: string; migratedCmd: string; outputFields: string[] } | null }[]
  >`
    SELECT upload_dir, comparison_contract FROM projects WHERE id = ${run.project_id}
  `;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const formData = await req.formData();
  const migratedFiles = formData.getAll('migratedFiles') as File[];
  if (migratedFiles.length === 0) {
    return NextResponse.json({ error: 'No fix uploaded (field "migratedFiles")' }, { status: 400 });
  }

  const uploadDir = join(process.cwd(), 'uploads', run.project_id);
  const legacyDir = join(uploadDir, 'legacy');
  const migratedDir = join(uploadDir, 'migrated');
  await mkdir(legacyDir, { recursive: true });
  await mkdir(migratedDir, { recursive: true });

  // Demo project has no upload_dir — materialize its legacy side from the fixtures
  // so the re-verified run uses the same oracle as the original demo run.
  let contract = project.comparison_contract;
  if (!project.upload_dir || !contract) {
    await cp(join(DEMO_FIXTURES, 'legacy.cbl'), join(legacyDir, 'legacy.cbl'));
    contract = { legacyCmd: POSIX_LEGACY_CMD, migratedCmd: '', outputFields: DEFAULT_OUTPUT_FIELDS };
  }

  // Replace the migrated side with the uploaded fix.
  for (const name of await readdir(migratedDir).catch(() => [] as string[])) {
    await rm(join(migratedDir, name), { force: true });
  }
  let migratedEntry = 'migrated.py';
  for (const file of migratedFiles) {
    await writeFile(join(migratedDir, file.name), Buffer.from(await file.arrayBuffer()));
    if (file.name.endsWith('.py')) migratedEntry = file.name;
  }

  contract = {
    legacyCmd: contract.legacyCmd || POSIX_LEGACY_CMD,
    migratedCmd: `python3 ${migratedEntry} inputs.csv migrated_outputs.csv`,
    outputFields: contract.outputFields?.length ? contract.outputFields : DEFAULT_OUTPUT_FIELDS,
  };

  await sql`
    UPDATE projects
    SET upload_dir = ${uploadDir}, comparison_contract = ${contract as unknown as string}
    WHERE id = ${run.project_id}
  `;

  const [newRun] = await sql`
    INSERT INTO verification_runs (project_id, status)
    VALUES (${run.project_id}, 'queued')
    RETURNING id
  `;
  return NextResponse.json({ runId: newRun.id });
}
