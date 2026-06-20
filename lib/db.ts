import postgres from 'postgres';
import { Signer } from '@aws-sdk/rds-signer';
import { fromWebToken } from '@aws-sdk/credential-providers';

function makePool() {
  const roleArn = process.env.AWS_ROLE_ARN;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;

  // Only use OIDC/IAM auth when actually running on Vercel (fresh token injected at runtime).
  // A token pulled from .env.local is stale; fall through to DATABASE_URL for local dev.
  if (roleArn && oidcToken && process.env.VERCEL) {
    const host = process.env.PGHOST!;
    const port = parseInt(process.env.PGPORT ?? '5432', 10);
    const database = process.env.PGDATABASE!;
    const username = process.env.PGUSER!;
    const region = process.env.AWS_REGION!;

    const credentials = fromWebToken({ roleArn, webIdentityToken: oidcToken });
    const signer = new Signer({ hostname: host, port, region, username, credentials });

    return postgres({
      host, port, database, username,
      password: () => signer.getAuthToken(),
      ssl: 'require',
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }

  // Prefer DATABASE_URL, then fall back to the Neon URL pulled by `vercel env pull`
  const url = process.env.DATABASE_URL
    ?? process.env.POSTGRES_URL_NON_POOLING
    ?? process.env.POSTGRES_URL;

  if (url) {
    return postgres(url, {
      ssl: 'require',
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }

  throw new Error('No database credentials. Set DATABASE_URL or AWS_ROLE_ARN + VERCEL_OIDC_TOKEN.');
}

const globalForPg = globalThis as unknown as { pg: ReturnType<typeof postgres> | undefined };
export const sql = globalForPg.pg ?? makePool();
if (process.env.NODE_ENV !== 'production') globalForPg.pg = sql;

export default sql;
