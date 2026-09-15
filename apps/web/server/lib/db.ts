import { createDbFromEnv, type Db } from '@bench-press/shared';

let db: Promise<Db> | undefined;

/** One client per function instance. The client is HTTP-based, so there is no pool to manage. */
export function getDb(): Promise<Db> {
  db ??= createDbFromEnv();
  return db;
}
