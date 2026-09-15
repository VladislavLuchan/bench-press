import { nowIso, type Db } from './client.ts';
import { text, textRequired } from './row.ts';
import type { SourceName, SourceState } from '../types.ts';

export async function getSourceStates(db: Db): Promise<Map<SourceName, SourceState>> {
  const result = await db.execute(
    `SELECT source, backoff_until, last_success_at, last_error FROM source_state`,
  );
  const states = new Map<SourceName, SourceState>();
  for (const row of result.rows) {
    const source = textRequired(row, 'source') as SourceName;
    states.set(source, {
      source,
      backoffUntil: text(row, 'backoff_until'),
      lastSuccessAt: text(row, 'last_success_at'),
      lastError: text(row, 'last_error'),
    });
  }
  return states;
}

export async function markSourceSuccess(db: Db, source: SourceName): Promise<void> {
  await db.execute({
    sql: `INSERT INTO source_state (source, backoff_until, last_success_at, last_error)
      VALUES (?, NULL, ?, NULL)
      ON CONFLICT (source) DO UPDATE SET
        backoff_until = NULL, last_success_at = excluded.last_success_at, last_error = NULL`,
    args: [source, nowIso()],
  });
}

export async function markSourceBackoff(
  db: Db,
  source: SourceName,
  backoff: { until: string; error: string },
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO source_state (source, backoff_until, last_error)
      VALUES (?, ?, ?)
      ON CONFLICT (source) DO UPDATE SET
        backoff_until = excluded.backoff_until, last_error = excluded.last_error`,
    args: [source, backoff.until, backoff.error.slice(0, 500)],
  });
}
