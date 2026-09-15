import type { Db } from './client.ts';
import { textRequired } from './row.ts';
import { COLUMN_MIGRATIONS, SCHEMA_STATEMENTS } from './schema.ts';

/** Applies the schema. Safe to call on every start: CREATE IF NOT EXISTS plus guarded ALTERs. */
export async function ensureSchema(db: Db): Promise<void> {
  await db.batch(
    SCHEMA_STATEMENTS.map((sql) => ({ sql, args: [] })),
    'write',
  );

  for (const migration of COLUMN_MIGRATIONS) {
    const columns = await db.execute(`PRAGMA table_info(${migration.table})`);
    const names = new Set(columns.rows.map((row) => textRequired(row, 'name')));
    if (!names.has(migration.column)) {
      await db.execute(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.ddl}`);
    }
  }
}
