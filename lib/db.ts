import postgres from 'postgres';
import { Signer } from '@aws-sdk/rds-signer';
import { fromWebToken } from '@aws-sdk/credential-providers';

function makePool() {
  // Connection target. Set DB_TARGET=aurora to force the Aurora IAM path (works locally
  // AND on Vercel); otherwise a DATABASE_URL is used when present. Point BOTH the app and
  // the worker at the same target so the equivalence ledger lives in ONE database.
  const target = process.env.DB_TARGET?.toLowerCase();
  const url = process.env.DATABASE_URL
    ?? process.env.POSTGRES_URL_NON_POOLING
    ?? process.env.POSTGRES_URL;

  // Aurora IAM auth via Vercel OIDC (STS assume-role -> short-lived RDS auth token).
  // Selected explicitly with DB_TARGET=aurora, or implicitly when no URL is configured.
  const useAurora = target === 'aurora' || (!url && !!process.env.AWS_ROLE_ARN);
  if (useAurora) {
    const roleArn = process.env.AWS_ROLE_ARN;
    const oidcToken = process.env.VERCEL_OIDC_TOKEN;
    if (!roleArn || !oidcToken) {
      throw new Error(
        'DB_TARGET=aurora requires AWS_ROLE_ARN + VERCEL_OIDC_TOKEN. The OIDC token expires ~12h; run `vercel env pull` to refresh it.',
      );
    }
    const host = process.env.PGHOST!;
    const port = parseInt(process.env.PGPORT ?? '5432', 10);
    const database = process.env.PGDATABASE!;
    const username = process.env.PGUSER!;
    const region = process.env.AWS_REGION!;

    const credentials = fromWebToken({ roleArn, webIdentityToken: oidcToken, clientConfig: { region } });
    const signer = new Signer({ hostname: host, port, region, username, credentials });

    return postgres({
      host, port, database, username,
      // Async fn so each new connection mints a fresh (15-min) RDS auth token.
      password: () => signer.getAuthToken(),
      ssl: 'require',
      max: 10,
      idle_timeout: 30,
      connect_timeout: 30, // cold STS + TLS handshake can exceed 10s
    });
  }

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

  throw new Error('No database credentials. Set DB_TARGET=aurora (+ AWS_ROLE_ARN, VERCEL_OIDC_TOKEN) or DATABASE_URL.');
}

const globalForPg = globalThis as unknown as { pg: ReturnType<typeof postgres> | undefined };
export const sql = globalForPg.pg ?? makePool();
if (process.env.NODE_ENV !== 'production') globalForPg.pg = sql;

export default sql;
