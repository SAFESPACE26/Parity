import postgres from 'postgres';
import { Signer } from '@aws-sdk/rds-signer';
import { fromWebToken } from '@aws-sdk/credential-providers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function migrate() {
  let sql: ReturnType<typeof postgres>;

  // Prefer DATABASE_URL (the unified Aurora connection used by app + worker); only
  // fall back to Aurora IAM/OIDC when no URL is set.
  const url = process.env.DATABASE_URL
    ?? process.env.POSTGRES_URL_NON_POOLING
    ?? process.env.POSTGRES_URL;

  if (url) {
    console.log('Using direct connection URL...');
    const localHost = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(url) || /sslmode=disable/.test(url);
    sql = postgres(url, { ssl: localHost ? false : 'require', max: 1 });
  } else {
    const roleArn = process.env.AWS_ROLE_ARN;
    const oidcToken = process.env.VERCEL_OIDC_TOKEN;
    if (!roleArn || !oidcToken) throw new Error('No database credentials. Set DATABASE_URL or AWS_ROLE_ARN + VERCEL_OIDC_TOKEN.');
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
