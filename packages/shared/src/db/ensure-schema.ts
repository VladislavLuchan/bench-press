import type { Db } from './client.ts';
import { SCHEMA_STATEMENTS } from './schema.ts';

/** Applies the schema. Safe to call on every start; all statements are IF NOT EXISTS. */
export async function ensureSchema(db: Db): Promise<void> {
  await db.batch(
    SCHEMA_STATEMENTS.map((sql) => ({ sql, args: [] })),
    'write',
  );
}
