import type { InValue, Row } from '@libsql/client';
import { nowIso, type Db } from './client.ts';
import { bool, integer, integerRequired, jsonArray, text, textRequired } from './row.ts';
import type { JobListQuery } from '../schemas.ts';
import type { Job, JobStatus, JobSummary, NewJob, ScoreResult, SourceName } from '../types.ts';

const SUMMARY_COLUMNS = `
  id, source, external_id, url, canonical_url, dedupe_key, title, company, location,
  salary_raw, describe_attempts, posted_at, first_seen_at, fit, summary, matches, gaps,
  red_flags, salary_llm, remote, seniority, scored_at, score_error, status, filter_reason,
  cover_letter IS NOT NULL AS has_cover_letter, cover_letter_lang, cover_letter_generated_at,
  notified_at, applied_at, replied_at, updated_at`;

const FULL_COLUMNS = `${SUMMARY_COLUMNS}, description, cover_letter`;

function rowToSummary(row: Row): JobSummary {
  return {
    id: integerRequired(row, 'id'),
    source: textRequired(row, 'source') as SourceName,
    externalId: text(row, 'external_id'),
    url: textRequired(row, 'url'),
    canonicalUrl: textRequired(row, 'canonical_url'),
    dedupeKey: textRequired(row, 'dedupe_key'),
    title: textRequired(row, 'title'),
    company: text(row, 'company'),
    location: text(row, 'location'),
    salaryRaw: text(row, 'salary_raw'),
    describeAttempts: integerRequired(row, 'describe_attempts'),
    postedAt: text(row, 'posted_at'),
    firstSeenAt: textRequired(row, 'first_seen_at'),
    fit: integer(row, 'fit'),
    summary: text(row, 'summary'),
    matches: jsonArray(row, 'matches'),
    gaps: jsonArray(row, 'gaps'),
    redFlags: jsonArray(row, 'red_flags'),
    salaryLlm: text(row, 'salary_llm'),
    remote: bool(row, 'remote'),
    seniority: text(row, 'seniority'),
    scoredAt: text(row, 'scored_at'),
    scoreError: text(row, 'score_error'),
    status: textRequired(row, 'status') as JobStatus,
    filterReason: text(row, 'filter_reason'),
    hasCoverLetter: bool(row, 'has_cover_letter') ?? false,
    coverLetterLang: text(row, 'cover_letter_lang'),
    coverLetterGeneratedAt: text(row, 'cover_letter_generated_at'),
    notifiedAt: text(row, 'notified_at'),
    appliedAt: text(row, 'applied_at'),
    repliedAt: text(row, 'replied_at'),
    updatedAt: textRequired(row, 'updated_at'),
  };
}

function rowToJob(row: Row): Job {
  const { hasCoverLetter: _hasCoverLetter, ...summary } = rowToSummary(row);
  return {
    ...summary,
    description: text(row, 'description'),
    coverLetter: text(row, 'cover_letter'),
  };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** SQLite caps bound parameters per statement; keep IN lists comfortably below it. */
const IN_CHUNK = 200;

async function selectExisting(db: Db, column: string, values: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK);
    const result = await db.execute({
      sql: `SELECT ${column} AS value FROM jobs WHERE ${column} IN (${placeholders(chunk.length)})`,
      args: chunk,
    });
    for (const row of result.rows) found.add(textRequired(row, 'value'));
  }
  return found;
}

/** Which of the given keys are already present in the database. */
export async function findExistingJobKeys(
  db: Db,
  keys: { canonicalUrls: string[]; dedupeKeys: string[] },
): Promise<{ canonicalUrls: Set<string>; dedupeKeys: Set<string> }> {
  return {
    canonicalUrls: await selectExisting(db, 'canonical_url', keys.canonicalUrls),
    dedupeKeys: await selectExisting(db, 'dedupe_key', keys.dedupeKeys),
  };
}

/** Inserts jobs in one batch. Duplicate canonical URLs are ignored, not errors. */
export async function insertJobs(db: Db, jobs: NewJob[]): Promise<number> {
  if (jobs.length === 0) return 0;
  const now = nowIso();
  const results = await db.batch(
    jobs.map((job) => ({
      sql: `INSERT OR IGNORE INTO jobs (
        source, external_id, url, canonical_url, dedupe_key, title, company, location,
        salary_raw, description, posted_at, remote, first_seen_at, status, filter_reason,
        updated_at
      ) VALUES (${placeholders(16)})`,
      args: [
        job.source,
        job.externalId,
        job.url,
        job.canonicalUrl,
        job.dedupeKey,
        job.title,
        job.company,
        job.location,
        job.salaryRaw,
        job.description,
        job.postedAt,
        job.remote === null ? null : Number(job.remote),
        now,
        job.status,
        job.filterReason,
        now,
      ],
    })),
    'write',
  );
  return results.reduce((sum, result) => sum + result.rowsAffected, 0);
}

export async function listJobs(db: Db, query: JobListQuery): Promise<JobSummary[]> {
  const where: string[] = [];
  const args: InValue[] = [];

  if (query.status) {
    where.push('status = ?');
    args.push(query.status);
  } else {
    where.push(`status != 'filtered'`);
  }
  if (query.minFit !== undefined) {
    where.push('fit >= ?');
    args.push(query.minFit);
  }
  if (query.source) {
    where.push('source = ?');
    args.push(query.source);
  }
  if (query.since) {
    where.push('first_seen_at >= ?');
    args.push(query.since);
  }

  const orderBy =
    query.sort === 'date'
      ? 'first_seen_at DESC, fit DESC'
      : 'fit IS NULL, fit DESC, first_seen_at DESC';
  args.push(query.limit);

  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM jobs WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ?`,
    args,
  });
  return result.rows.map(rowToSummary);
}

export async function getJob(db: Db, id: number): Promise<Job | null> {
  const result = await db.execute({
    sql: `SELECT ${FULL_COLUMNS} FROM jobs WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  return row ? rowToJob(row) : null;
}

export async function updateJobStatus(db: Db, id: number, status: JobStatus): Promise<boolean> {
  const now = nowIso();
  const result = await db.execute({
    sql: `UPDATE jobs SET
      status = ?,
      applied_at = CASE WHEN ? = 'applied' THEN COALESCE(applied_at, ?) ELSE applied_at END,
      replied_at = CASE WHEN ? = 'replied' THEN COALESCE(replied_at, ?) ELSE replied_at END,
      updated_at = ?
    WHERE id = ?`,
    args: [status, status, now, status, now, now, id],
  });
  return result.rowsAffected > 0;
}

export async function saveCoverLetter(
  db: Db,
  id: number,
  letter: { text: string; lang: string | null; generated: boolean },
): Promise<boolean> {
  const now = nowIso();
  const result = await db.execute({
    sql: `UPDATE jobs SET
      cover_letter = ?,
      cover_letter_lang = COALESCE(?, cover_letter_lang),
      cover_letter_generated_at = CASE WHEN ? THEN ? ELSE cover_letter_generated_at END,
      updated_at = ?
    WHERE id = ?`,
    args: [letter.text, letter.lang, Number(letter.generated), now, now, id],
  });
  return result.rowsAffected > 0;
}

/** Jobs that still need a full description fetched. Gives up after `maxAttempts`. */
export async function findJobsMissingDescription(
  db: Db,
  options: { maxAttempts: number; limit: number },
): Promise<Job[]> {
  const result = await db.execute({
    sql: `SELECT ${FULL_COLUMNS} FROM jobs
      WHERE status = 'new' AND description IS NULL AND describe_attempts < ?
      ORDER BY first_seen_at DESC LIMIT ?`,
    args: [options.maxAttempts, options.limit],
  });
  return result.rows.map(rowToJob);
}

export async function saveDescription(db: Db, id: number, description: string): Promise<void> {
  await db.execute({
    sql: `UPDATE jobs SET description = ?, describe_attempts = describe_attempts + 1, updated_at = ? WHERE id = ?`,
    args: [description, nowIso(), id],
  });
}

export async function recordDescribeFailure(db: Db, id: number): Promise<void> {
  await db.execute({
    sql: `UPDATE jobs SET describe_attempts = describe_attempts + 1, updated_at = ? WHERE id = ?`,
    args: [nowIso(), id],
  });
}

export async function findJobsToScore(db: Db, limit: number): Promise<Job[]> {
  const result = await db.execute({
    sql: `SELECT ${FULL_COLUMNS} FROM jobs
      WHERE status = 'new' AND scored_at IS NULL AND description IS NOT NULL
      ORDER BY first_seen_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map(rowToJob);
}

export async function saveScore(db: Db, id: number, score: ScoreResult): Promise<void> {
  const now = nowIso();
  await db.execute({
    sql: `UPDATE jobs SET
      fit = ?, summary = ?, matches = ?, gaps = ?, red_flags = ?, salary_llm = ?, remote = ?,
      seniority = ?, scored_at = ?, score_error = NULL, updated_at = ?
    WHERE id = ?`,
    args: [
      score.fit,
      score.summary,
      JSON.stringify(score.matches),
      JSON.stringify(score.gaps),
      JSON.stringify(score.red_flags),
      score.salary,
      Number(score.remote),
      score.seniority,
      now,
      now,
      id,
    ],
  });
}

export async function saveScoreError(db: Db, id: number, message: string): Promise<void> {
  await db.execute({
    sql: `UPDATE jobs SET score_error = ?, updated_at = ? WHERE id = ?`,
    args: [message.slice(0, 500), nowIso(), id],
  });
}

export async function findJobsToNotify(db: Db, minFit: number): Promise<JobSummary[]> {
  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM jobs
      WHERE status = 'new' AND notified_at IS NULL AND fit >= ?
      ORDER BY fit DESC, first_seen_at DESC`,
    args: [minFit],
  });
  return result.rows.map(rowToSummary);
}

export async function markNotified(db: Db, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const now = nowIso();
  await db.batch(
    ids.map((id) => ({
      sql: `UPDATE jobs SET notified_at = ?, updated_at = ? WHERE id = ?`,
      args: [now, now, id],
    })),
    'write',
  );
}
