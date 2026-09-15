import { createClient, type Client } from '@libsql/client';

export type Db = Client;

export interface DbConfig {
  url: string;
  authToken?: string | undefined;
}

/**
 * Creates a libsql client. Accepts `https://` (Turso over stateless HTTP, safe for
 * serverless) and `file:` (local SQLite). `libsql://` is rejected on purpose: it opens a
 * websocket that misbehaves in short-lived serverless invocations.
 */
export function createDb(config: DbConfig): Db {
  if (config.url.startsWith('libsql://')) {
    throw new Error('Use an https:// Turso URL instead of libsql:// (see .env.example)');
  }
  return createClient({ url: config.url, authToken: config.authToken });
}

export function createDbFromEnv(env: NodeJS.ProcessEnv = process.env): Db {
  const url = env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  return createDb({ url, authToken: env.TURSO_AUTH_TOKEN });
}

/** Current time as ISO 8601, the only timestamp format stored in the database. */
export function nowIso(): string {
  return new Date().toISOString();
}
