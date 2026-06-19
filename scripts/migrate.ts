import postgres from 'postgres';
import { Signer } from '@aws-sdk/rds-signer';
import { fromWebToken } from '@aws-sdk/credential-providers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function migrate() {
  let sql: ReturnType<typeof postgres>;

  const roleArn = process.env.AWS_ROLE_ARN;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;

  if (roleArn && oidcToken) {
    // Aurora IAM auth via OIDC web identity
    console.log('Using Aurora IAM auth...');
    const host = process.env.PGHOST!;
    const port = parseInt(process.env.PGPORT ?? '5432', 10);
    const database = process.env.PGDATABASE!;
    const username = process.env.PGUSER!;
    const region = process.env.AWS_REGION!;

    const credentials = fromWebToken({ roleArn, webIdentityToken: oidcToken });
    const signer = new Signer({ hostname: host, port, region, username, credentials });
    const password = await signer.getAuthToken();

    sql = postgres({ host, port, database, username, password, ssl: 'require', max: 1 });
  } else if (process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL...');
    sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });
  } else {
    throw new Error('No database credentials found. Set AWS_ROLE_ARN + VERCEL_OIDC_TOKEN or DATABASE_URL.');
  }

  const schema = readFileSync(join(process.cwd(), 'lib', 'schema.sql'), 'utf8');
  console.log('Running migration...');
  await sql.unsafe(schema);
  console.log('Migration complete.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
