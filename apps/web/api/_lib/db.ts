import { createDbFromEnv, type Db } from '@bench-press/shared';

let db: Db | undefined;

/** One client per function instance. The client is HTTP-based, so there is no pool to manage. */
export function getDb(): Db {
  db ??= createDbFromEnv();
  return db;
}
