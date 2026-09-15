import { nowIso, type Db } from './client.ts';
import { integerRequired, text, textRequired } from './row.ts';
import type { Run, RunStats } from '../types.ts';

export async function startRun(db: Db): Promise<number> {
  const result = await db.execute({
    sql: `INSERT INTO runs (started_at) VALUES (?)`,
    args: [nowIso()],
  });
  if (result.lastInsertRowid === undefined) throw new Error('INSERT into runs returned no id');
  return Number(result.lastInsertRowid);
}

export async function finishRun(
  db: Db,
  id: number,
  outcome: { stats: RunStats; error: string | null },
): Promise<void> {
  await db.execute({
    sql: `UPDATE runs SET finished_at = ?, stats = ?, error = ? WHERE id = ?`,
    args: [nowIso(), JSON.stringify(outcome.stats), outcome.error, id],
  });
}

export async function listRuns(db: Db, limit: number): Promise<Run[]> {
  const result = await db.execute({
    sql: `SELECT id, started_at, finished_at, stats, error FROM runs ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => {
    const rawStats = text(row, 'stats');
    return {
      id: integerRequired(row, 'id'),
      startedAt: textRequired(row, 'started_at'),
      finishedAt: text(row, 'finished_at'),
      stats: rawStats ? (JSON.parse(rawStats) as RunStats) : null,
      error: text(row, 'error'),
    };
  });
}
