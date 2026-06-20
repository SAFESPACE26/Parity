import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function POST() {
  let [project] = await sql`SELECT id FROM projects WHERE name = 'COBOL Interest & Payroll'`;
  if (!project) {
    [project] = await sql`
      INSERT INTO projects (name, source_language, target_language)
      VALUES ('COBOL Interest & Payroll', 'COBOL', 'Python')
      RETURNING id
    `;
  }
  const projectId = project.id;
  for (const moduleName of ['interest_calc', 'payroll']) {
    const [existing] = await sql`SELECT id FROM modules WHERE project_id = ${projectId} AND name = ${moduleName}`;
    if (!existing) {
      await sql`INSERT INTO modules (project_id, name) VALUES (${projectId}, ${moduleName})`;
    }
  }
  return NextResponse.json({ projectId });
}
