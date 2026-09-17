import type { InValue, Row } from '@libsql/client';
import { nowIso, type Db } from './client.ts';
import { bool, integer, integerRequired, jsonArray, text, textRequired } from './row.ts';
import type { JobListQuery } from '../schemas.ts';
import type {
  CompanyType,
  Job,
  JobEvent,
  JobStage,
  JobStatus,
  JobSummary,
  LocationFlag,
  LocationType,
  NewJob,
  RoleType,
  ScoreResult,
  SourceName,
} from '../types.ts';

const SUMMARY_COLUMNS = `
  id, source, sources, external_id, url, canonical_url, dedupe_key, title, company, location,
  salary_raw, describe_attempts, thin_description, posted_at, first_seen_at, fit, fit_raw,
  fit_notes, summary, matches, gaps, red_flags, salary_llm, remote, seniority, primary_stack,
  location_type, location_flag, role_type, company_type, dream, scored_at, score_error, status,
  stage, stage_updated_at, notes, filter_reason, filter_match,
  cover_letter IS NOT NULL AS has_cover_letter, cover_letter_lang, cover_letter_generated_at,
  notified_at, applied_at, replied_at, updated_at`;

const FULL_COLUMNS = `${SUMMARY_COLUMNS}, description, cover_letter`;

function parseSources(row: Row): SourceName[] {
  const sources = jsonArray(row, 'sources') as SourceName[];
  const primary = textRequired(row, 'source') as SourceName;
  return sources.length > 0 ? sources : [primary];
}

function rowToSummary(row: Row): JobSummary {
  return {
    id: integerRequired(row, 'id'),
    source: textRequired(row, 'source') as SourceName,
    sources: parseSources(row),
    externalId: text(row, 'external_id'),
    url: textRequired(row, 'url'),
    canonicalUrl: textRequired(row, 'canonical_url'),
    dedupeKey: textRequired(row, 'dedupe_key'),
    title: textRequired(row, 'title'),
    company: text(row, 'company'),
    location: text(row, 'location'),
    salaryRaw: text(row, 'salary_raw'),
    describeAttempts: integerRequired(row, 'describe_attempts'),
    thinDescription: bool(row, 'thin_description') ?? false,
    postedAt: text(row, 'posted_at'),
    firstSeenAt: textRequired(row, 'first_seen_at'),
    fit: integer(row, 'fit'),
    fitRaw: integer(row, 'fit_raw'),
    fitNotes: jsonArray(row, 'fit_notes'),
    summary: text(row, 'summary'),
    matches: jsonArray(row, 'matches'),
    gaps: jsonArray(row, 'gaps'),
    redFlags: jsonArray(row, 'red_flags'),
    salaryLlm: text(row, 'salary_llm'),
    remote: bool(row, 'remote'),
    seniority: text(row, 'seniority'),
    primaryStack: text(row, 'primary_stack'),
    roleType: (text(row, 'role_type') ?? 'frontend') as RoleType,
    companyType: text(row, 'company_type') as CompanyType | null,
    dream: bool(row, 'dream') ?? false,
    locationType: text(row, 'location_type') as LocationType | null,
    locationFlag: (text(row, 'location_flag') ?? 'none') as LocationFlag,
    scoredAt: text(row, 'scored_at'),
    scoreError: text(row, 'score_error'),
    status: textRequired(row, 'status') as JobStatus,
    stage: text(row, 'stage') as JobStage | null,
    stageUpdatedAt: text(row, 'stage_updated_at'),
    notes: text(row, 'notes'),
    filterReason: text(row, 'filter_reason'),
    filterMatch: text(row, 'filter_match'),
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

export interface ExistingJobRef {
  id: number;
  sources: SourceName[];
}

async function selectExisting(
  db: Db,
  column: string,
  values: string[],
): Promise<Map<string, ExistingJobRef>> {
  const found = new Map<string, ExistingJobRef>();
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK);
    const result = await db.execute({
      sql: `SELECT ${column} AS value, id, source, sources FROM jobs WHERE ${column} IN (${placeholders(chunk.length)})`,
      args: chunk,
    });
    for (const row of result.rows) {
      found.set(textRequired(row, 'value'), {
        id: integerRequired(row, 'id'),
        sources: parseSources(row),
      });
    }
  }
  return found;
}

/** Which of the given keys are already present, with the row they belong to. */
export async function findExistingJobKeys(
  db: Db,
  keys: { canonicalUrls: string[]; dedupeKeys: string[] },
): Promise<{
  canonicalUrls: Map<string, ExistingJobRef>;
  dedupeKeys: Map<string, ExistingJobRef>;
}> {
  return {
    canonicalUrls: await selectExisting(db, 'canonical_url', keys.canonicalUrls),
    dedupeKeys: await selectExisting(db, 'dedupe_key', keys.dedupeKeys),
  };
}

/** Records that an already stored opening was also seen on other sources. */
export async function addJobSources(
  db: Db,
  updates: Array<{ id: number; sources: SourceName[] }>,
): Promise<void> {
  if (updates.length === 0) return;
  const now = nowIso();
  await db.batch(
    updates.map((update) => ({
      sql: `UPDATE jobs SET sources = ?, updated_at = ? WHERE id = ?`,
      args: [JSON.stringify(update.sources), now, update.id],
    })),
    'write',
  );
}

/** Inserts jobs in one batch. Duplicate canonical URLs are ignored, not errors. */
export async function insertJobs(db: Db, jobs: NewJob[]): Promise<number> {
  if (jobs.length === 0) return 0;
  const now = nowIso();
  const results = await db.batch(
    jobs.map((job) => ({
      sql: `INSERT OR IGNORE INTO jobs (
        source, sources, external_id, url, canonical_url, dedupe_key, title, company, location,
        salary_raw, description, description_hash, thin_description, location_flag, role_type,
        posted_at, remote, first_seen_at, status, filter_reason, filter_match, updated_at
      ) VALUES (${placeholders(22)})`,
      args: [
        job.source,
        JSON.stringify(job.sources ?? [job.source]),
        job.externalId,
        job.url,
        job.canonicalUrl,
        job.dedupeKey,
        job.title,
        job.company,
        job.location,
        job.salaryRaw,
        job.description,
        job.descriptionHash,
        Number(job.thinDescription),
        job.locationFlag,
        job.roleType,
        job.postedAt,
        job.remote === null ? null : Number(job.remote),
        now,
        job.status,
        job.filterReason,
        job.filterMatch,
        now,
      ],
    })),
    'write',
  );
  return results.reduce((sum, result) => sum + result.rowsAffected, 0);
}

/** WHERE, ORDER BY and bound values for the dashboard list filters. */
function jobFilterSql(query: JobListQuery): { sql: string; args: InValue[] } {
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
  if (query.locationType && query.locationType.length > 0) {
    const types = query.locationType.filter((type) => type !== 'unscored');
    const clauses: string[] = [];
    if (types.length > 0) {
      clauses.push(`location_type IN (${placeholders(types.length)})`);
      args.push(...types);
    }
    if (query.locationType.includes('unscored')) clauses.push('location_type IS NULL');
    where.push(`(${clauses.join(' OR ')})`);
  }

  if (query.roleType && query.roleType.length > 0) {
    where.push(`role_type IN (${placeholders(query.roleType.length)})`);
    args.push(...query.roleType);
  }
  if (query.companyType && query.companyType.length > 0) {
    const types = query.companyType.filter((type) => type !== 'unscored');
    const clauses: string[] = [];
    if (types.length > 0) {
      clauses.push(`company_type IN (${placeholders(types.length)})`);
      args.push(...types);
    }
    if (query.companyType.includes('unscored')) clauses.push('company_type IS NULL');
    where.push(`(${clauses.join(' OR ')})`);
  }
  if (query.dream) where.push('dream = 1');

  // Equal fit: dream jobs first, then the freshest.
  const orderBy =
    query.sort === 'date'
      ? 'first_seen_at DESC, fit DESC'
      : 'fit IS NULL, fit DESC, dream DESC, first_seen_at DESC';
  args.push(query.limit);

  return { sql: `WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ?`, args };
}

export async function listJobs(db: Db, query: JobListQuery): Promise<JobSummary[]> {
  const filter = jobFilterSql(query);
  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM jobs ${filter.sql}`,
    args: filter.args,
  });
  return result.rows.map(rowToSummary);
}

/** Same filters as `listJobs`, with descriptions and cover letters, for exports. */
export async function listJobsFull(db: Db, query: JobListQuery): Promise<Job[]> {
  const filter = jobFilterSql(query);
  const result = await db.execute({
    sql: `SELECT ${FULL_COLUMNS} FROM jobs ${filter.sql}`,
    args: filter.args,
  });
  return result.rows.map(rowToJob);
}

export async function getJob(db: Db, id: number): Promise<Job | null> {
  const result = await db.execute({
    sql: `SELECT ${FULL_COLUMNS} FROM jobs WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  return row ? rowToJob(row) : null;
}

/** Every status, stage or note change leaves a row here, so history is never lost. */
export async function recordJobEvent(
  db: Db,
  event: { jobId: number; kind: JobEvent['kind']; value: string },
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO job_events (job_id, kind, value, created_at) VALUES (?, ?, ?, ?)`,
    args: [event.jobId, event.kind, event.value, nowIso()],
  });
}

export async function listJobEvents(db: Db, jobId: number): Promise<JobEvent[]> {
  const result = await db.execute({
    sql: `SELECT id, job_id, kind, value, created_at FROM job_events WHERE job_id = ? ORDER BY id`,
    args: [jobId],
  });
  return result.rows.map((row) => ({
    id: integerRequired(row, 'id'),
    jobId: integerRequired(row, 'job_id'),
    kind: textRequired(row, 'kind') as JobEvent['kind'],
    value: textRequired(row, 'value'),
    createdAt: textRequired(row, 'created_at'),
  }));
}

export async function updateJobStatus(db: Db, id: number, status: JobStatus): Promise<boolean> {
  const now = nowIso();
  const result = await db.execute({
    sql: `UPDATE jobs SET
      status = ?,
      applied_at = CASE WHEN ? = 'applied' THEN COALESCE(applied_at, ?) ELSE applied_at END,
      replied_at = CASE WHEN ? = 'replied' THEN COALESCE(replied_at, ?) ELSE replied_at END,
      stage = CASE WHEN ? = 'replied' THEN COALESCE(stage, 'replied') ELSE stage END,
      updated_at = ?
    WHERE id = ?`,
    args: [status, status, now, status, now, status, now, id],
  });
  if (result.rowsAffected > 0)
    await recordJobEvent(db, { jobId: id, kind: 'status', value: status });
  return result.rowsAffected > 0;
}

/**
 * Moves a job between pipeline columns. Any stage implies a reply, so status becomes
 * `replied`; clearing the stage puts the job back into the Applied column.
 */
export async function updateJobStage(db: Db, id: number, stage: JobStage | null): Promise<boolean> {
  const now = nowIso();
  const result = await db.execute({
    sql: `UPDATE jobs SET
      stage = ?,
      stage_updated_at = ?,
      status = CASE WHEN ? IS NULL THEN 'applied' ELSE 'replied' END,
      applied_at = COALESCE(applied_at, ?),
      replied_at = CASE WHEN ? IS NULL THEN replied_at ELSE COALESCE(replied_at, ?) END,
      updated_at = ?
    WHERE id = ?`,
    args: [stage, now, stage, now, stage, now, now, id],
  });
  if (result.rowsAffected > 0) {
    await recordJobEvent(db, { jobId: id, kind: 'stage', value: stage ?? 'applied' });
  }
  return result.rowsAffected > 0;
}

export async function saveJobNotes(db: Db, id: number, notes: string): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE jobs SET notes = ?, updated_at = ? WHERE id = ?`,
    args: [notes, nowIso(), id],
  });
  if (result.rowsAffected > 0) {
    await recordJobEvent(db, { jobId: id, kind: 'note', value: notes.slice(0, 200) });
  }
  return result.rowsAffected > 0;
}

/** Everything applied or answered, for the pipeline board. */
/** Pipeline jobs with descriptions and cover letters, for exports. */
export async function listPipelineJobsFull(db: Db): Promise<Job[]> {
  const result = await db.execute(
    `SELECT ${FULL_COLUMNS} FROM jobs WHERE status IN ('applied', 'replied')
      ORDER BY COALESCE(stage_updated_at, replied_at, applied_at) DESC`,
  );
  return result.rows.map(rowToJob);
}

/** Change history for many jobs at once, grouped by job id and ordered oldest first. */
export async function listEventsForJobs(
  db: Db,
  jobIds: number[],
): Promise<Map<number, JobEvent[]>> {
  const events = new Map<number, JobEvent[]>();
  for (let i = 0; i < jobIds.length; i += IN_CHUNK) {
    const chunk = jobIds.slice(i, i + IN_CHUNK);
    const result = await db.execute({
      sql: `SELECT id, job_id, kind, value, created_at FROM job_events
        WHERE job_id IN (${placeholders(chunk.length)}) ORDER BY id`,
      args: chunk,
    });
    for (const row of result.rows) {
      const event: JobEvent = {
        id: integerRequired(row, 'id'),
        jobId: integerRequired(row, 'job_id'),
        kind: textRequired(row, 'kind') as JobEvent['kind'],
        value: textRequired(row, 'value'),
        createdAt: textRequired(row, 'created_at'),
      };
      const list = events.get(event.jobId) ?? [];
      list.push(event);
      events.set(event.jobId, list);
    }
  }
  return events;
}

export async function listPipelineJobs(db: Db): Promise<JobSummary[]> {
  const result = await db.execute(
    `SELECT ${SUMMARY_COLUMNS} FROM jobs WHERE status IN ('applied', 'replied')
      ORDER BY COALESCE(stage_updated_at, replied_at, applied_at) DESC`,
  );
  return result.rows.map(rowToSummary);
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

export async function saveDescription(
  db: Db,
  id: number,
  description: string,
  options: { thin: boolean; locationFlag: LocationFlag; hash: string },
): Promise<void> {
  await db.execute({
    sql: `UPDATE jobs SET description = ?, description_hash = ?, thin_description = ?,
      location_flag = ?, describe_attempts = describe_attempts + 1, updated_at = ? WHERE id = ?`,
    args: [description, options.hash, Number(options.thin), options.locationFlag, nowIso(), id],
  });
}

/**
 * Another open or handled job of the same company with the same description text.
 * Staffing firms repost one text under several titles; only the first copy is kept.
 */
export async function findDuplicateDescription(
  db: Db,
  job: { id: number | null; company: string | null; hash: string },
): Promise<number | null> {
  if (!job.company) return null;
  const result = await db.execute({
    sql: `SELECT id FROM jobs
      WHERE description_hash = ? AND lower(company) = lower(?) AND id != ? AND status != 'filtered'
      ORDER BY id LIMIT 1`,
    args: [job.hash, job.company, job.id ?? -1],
  });
  const row = result.rows[0];
  return row ? integerRequired(row, 'id') : null;
}

export async function setDescriptionHash(db: Db, id: number, hash: string): Promise<void> {
  await db.execute({ sql: `UPDATE jobs SET description_hash = ? WHERE id = ?`, args: [hash, id] });
}

export async function updateRoleTypes(
  db: Db,
  updates: Array<{ id: number; roleType: RoleType }>,
): Promise<void> {
  for (let i = 0; i < updates.length; i += IN_CHUNK) {
    await db.batch(
      updates.slice(i, i + IN_CHUNK).map((update) => ({
        sql: `UPDATE jobs SET role_type = ? WHERE id = ?`,
        args: [update.roleType, update.id],
      })),
      'write',
    );
  }
}

/** Listing fields of every job, enough to re-run the title-level filters and role typing. */
export async function listJobsForRefilter(db: Db): Promise<JobSummary[]> {
  const result = await db.execute(
    `SELECT ${SUMMARY_COLUMNS} FROM jobs WHERE status IN ('new', 'filtered')`,
  );
  return result.rows.map(rowToSummary);
}

/** Puts a filtered job back into the queue; the next run fetches its description and scores it. */
export async function reviveJob(db: Db, id: number): Promise<void> {
  await db.execute({
    sql: `UPDATE jobs SET status = 'new', filter_reason = NULL, filter_match = NULL,
      describe_attempts = 0, updated_at = ? WHERE id = ? AND status = 'filtered'`,
    args: [nowIso(), id],
  });
}

/** Moves a job out of the scoring queue after a description-level check failed. */
export async function markFiltered(
  db: Db,
  id: number,
  filter: { reason: string; match: string | null },
): Promise<void> {
  await db.execute({
    sql: `UPDATE jobs SET status = 'filtered', filter_reason = ?, filter_match = ?, updated_at = ?
      WHERE id = ? AND status = 'new'`,
    args: [filter.reason, filter.match, nowIso(), id],
  });
}

/** Scored, still-open jobs with a description: the set a rescore run re-evaluates. */
export async function findJobsToRescore(db: Db, limit: number): Promise<Job[]> {
  const result = await db.execute({
    sql: `SELECT ${FULL_COLUMNS} FROM jobs
      WHERE status = 'new' AND description IS NOT NULL
      ORDER BY first_seen_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map(rowToJob);
}

export async function updateLocationFlag(db: Db, id: number, flag: LocationFlag): Promise<void> {
  await db.execute({
    sql: `UPDATE jobs SET location_flag = ?, updated_at = ? WHERE id = ?`,
    args: [flag, nowIso(), id],
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

export interface ValidatedScore {
  score: ScoreResult;
  /** The model's fit before post-validation. */
  fitRaw: number;
  notes: string[];
  /** Product + remote + at least one dream signal; decided in code. */
  dream: boolean;
}

export async function saveScore(db: Db, id: number, validated: ValidatedScore): Promise<void> {
  const { score, fitRaw, notes } = validated;
  const now = nowIso();
  await db.execute({
    sql: `UPDATE jobs SET
      fit = ?, fit_raw = ?, fit_notes = ?, summary = ?, matches = ?, gaps = ?, red_flags = ?,
      salary_llm = ?, remote = ?, seniority = ?, primary_stack = ?, location_type = ?,
      company_type = ?, dream = ?, scored_at = ?, score_error = NULL, updated_at = ?
    WHERE id = ?`,
    args: [
      score.fit,
      fitRaw,
      JSON.stringify(notes),
      score.summary,
      JSON.stringify(score.matches),
      JSON.stringify(score.gaps),
      JSON.stringify(score.red_flags),
      score.salary,
      Number(score.remote),
      score.seniority,
      score.primary_stack,
      score.location_type,
      score.company_type,
      Number(validated.dream),
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
