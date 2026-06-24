import postgres from 'postgres';
import { Signer } from '@aws-sdk/rds-signer';
import { fromWebToken } from '@aws-sdk/credential-providers';

function makePool() {
  // Single source of truth: DATABASE_URL. Point BOTH the Vercel app and the worker
  // at the same Aurora cluster here so the equivalence ledger lives in ONE database.
  // (Precedence: explicit URL first; the IAM/OIDC path below is only a fallback for a
  // Vercel deploy with no DATABASE_URL. This avoids the app↔worker split where the app
  // used Aurora-via-IAM while the worker wrote to a different DATABASE_URL.)
  const url = process.env.DATABASE_URL
    ?? process.env.POSTGRES_URL_NON_POOLING
    ?? process.env.POSTGRES_URL;

  if (url) {
    // Local/containerized postgres (docker compose `db`) has no TLS; cloud (Aurora/Neon) requires it.
    const localHost = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(url) || /sslmode=disable/.test(url);
    return postgres(url, {
      ssl: localHost ? false : 'require',
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }

  // Fallback: Aurora IAM auth via Vercel OIDC (only when no DATABASE_URL is configured).
  const roleArn = process.env.AWS_ROLE_ARN;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
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

  throw new Error('No database credentials. Set DATABASE_URL (recommended) or AWS_ROLE_ARN + VERCEL_OIDC_TOKEN on Vercel.');
}

const globalForPg = globalThis as unknown as { pg: ReturnType<typeof postgres> | undefined };
export const sql = globalForPg.pg ?? makePool();
if (process.env.NODE_ENV !== 'production') globalForPg.pg = sql;

export default sql;
