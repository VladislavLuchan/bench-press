import type { Client } from '@libsql/client';

export type Db = Client;

export interface DbConfig {
  url: string;
  authToken?: string | undefined;
}

/**
 * Creates a libsql client. `https://` Turso URLs use the fetch-based web client, which has
 * no native dependency and is safe in serverless functions. `file:` URLs load the Node
 * client (with its native SQLite binding) on demand for local databases.
 * `libsql://` is rejected on purpose: it opens a websocket that misbehaves in short-lived
 * serverless invocations.
 */
export async function createDb(config: DbConfig): Promise<Db> {
  if (config.url.startsWith('libsql://')) {
    throw new Error('Use an https:// Turso URL instead of libsql:// (see .env.example)');
  }
  if (config.url.startsWith('file:')) {
    const { createClient } = await import('@libsql/client');
    return createClient({ url: config.url });
  }
  const { createClient } = await import('@libsql/client/web');
  return createClient({ url: config.url, authToken: config.authToken });
}

export function createDbFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<Db> {
  const url = env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  return createDb({ url, authToken: env.TURSO_AUTH_TOKEN });
}

/** Current time as ISO 8601, the only timestamp format stored in the database. */
export function nowIso(): string {
  return new Date().toISOString();
}
