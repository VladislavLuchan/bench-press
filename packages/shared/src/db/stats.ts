import type { ResultSet } from '@libsql/client';
import type { Db } from './client.ts';
import { integerRequired, text, textRequired } from './row.ts';
import type { ConversionRow, DailyCount, DashboardStats, StatusTotals } from '../types.ts';

const APPLIED = `applied_at IS NOT NULL`;

const STATS_QUERIES = {
  perDay: `SELECT substr(applied_at, 1, 10) AS day, COUNT(*) AS count FROM jobs
    WHERE ${APPLIED} AND applied_at >= date('now', '-30 days')
    GROUP BY day ORDER BY day`,
  perWeek: `SELECT strftime('%Y-W%W', applied_at) AS day, COUNT(*) AS count FROM jobs
    WHERE ${APPLIED} AND applied_at >= date('now', '-84 days')
    GROUP BY day ORDER BY day`,
  bySource: `SELECT source AS bucket, COUNT(*) AS applied,
    SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) AS replied
    FROM jobs WHERE ${APPLIED} GROUP BY source ORDER BY source`,
  byFit: `SELECT COALESCE(CAST(fit AS TEXT), 'unscored') AS bucket, COUNT(*) AS applied,
    SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) AS replied
    FROM jobs WHERE ${APPLIED} GROUP BY bucket ORDER BY fit DESC`,
  totals: `SELECT status, COUNT(*) AS count FROM jobs GROUP BY status`,
  appliedToday: `SELECT COUNT(*) AS count FROM jobs WHERE applied_at >= date('now')`,
  byRoleType: `SELECT role_type AS bucket, COUNT(*) AS count FROM jobs
    WHERE status = 'new' GROUP BY role_type ORDER BY count DESC`,
  byCompanyType: `SELECT COALESCE(company_type, 'unscored') AS bucket, COUNT(*) AS count FROM jobs
    WHERE status = 'new' GROUP BY bucket ORDER BY count DESC`,
} as const;

type StatsKey = keyof typeof STATS_QUERIES;

function toDaily(result: ResultSet): DailyCount[] {
  return result.rows.map((row) => ({
    day: textRequired(row, 'day'),
    count: integerRequired(row, 'count'),
  }));
}

function toConversion(result: ResultSet): ConversionRow[] {
  return result.rows.map((row) => ({
    bucket: text(row, 'bucket') ?? 'unknown',
    applied: integerRequired(row, 'applied'),
    replied: integerRequired(row, 'replied'),
  }));
}

function toBuckets(result: ResultSet): Array<{ bucket: string; count: number }> {
  return result.rows.map((row) => ({
    bucket: text(row, 'bucket') ?? 'unknown',
    count: integerRequired(row, 'count'),
  }));
}

function countOf(result: ResultSet): number {
  const row = result.rows[0];
  return row ? integerRequired(row, 'count') : 0;
}

function toTotals(result: ResultSet): StatusTotals {
  const totals: StatusTotals = { new: 0, applied: 0, skipped: 0, replied: 0, filtered: 0 };
  for (const row of result.rows) {
    const status = textRequired(row, 'status');
    if (status in totals) totals[status as keyof StatusTotals] = integerRequired(row, 'count');
  }
  return totals;
}

/** Application counts and reply conversion, computed in SQL for the Stats page. */
export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const keys = Object.keys(STATS_QUERIES) as StatsKey[];
  const results = await db.batch(
    keys.map((key) => STATS_QUERIES[key]),
    'read',
  );
  const resultFor = (key: StatsKey): ResultSet => {
    const result = results[keys.indexOf(key)];
    if (!result) throw new Error(`Missing result for stats query ${key}`);
    return result;
  };

  return {
    appliedPerDay: toDaily(resultFor('perDay')),
    appliedPerWeek: toDaily(resultFor('perWeek')),
    bySource: toConversion(resultFor('bySource')),
    byFit: toConversion(resultFor('byFit')),
    totals: toTotals(resultFor('totals')),
    appliedToday: countOf(resultFor('appliedToday')),
    byRoleType: toBuckets(resultFor('byRoleType')),
    byCompanyType: toBuckets(resultFor('byCompanyType')),
  };
}
