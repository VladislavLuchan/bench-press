/**
 * Database schema. Every statement is idempotent so `ensureSchema` can run on each scraper
 * start. Future changes go at the bottom as guarded ALTER statements, never as edits to
 * existing CREATE statements.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    external_id TEXT,
    url TEXT NOT NULL,
    canonical_url TEXT NOT NULL UNIQUE,
    dedupe_key TEXT NOT NULL,
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    salary_raw TEXT,
    description TEXT,
    describe_attempts INTEGER NOT NULL DEFAULT 0,
    posted_at TEXT,
    first_seen_at TEXT NOT NULL,
    fit INTEGER,
    summary TEXT,
    matches TEXT,
    gaps TEXT,
    red_flags TEXT,
    salary_llm TEXT,
    remote INTEGER,
    seniority TEXT,
    scored_at TEXT,
    score_error TEXT,
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new', 'applied', 'skipped', 'replied', 'filtered')),
    filter_reason TEXT,
    cover_letter TEXT,
    cover_letter_lang TEXT,
    cover_letter_generated_at TEXT,
    notified_at TEXT,
    applied_at TEXT,
    replied_at TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS jobs_dedupe_key ON jobs (dedupe_key)`,
  `CREATE INDEX IF NOT EXISTS jobs_status_fit ON jobs (status, fit)`,
  `CREATE INDEX IF NOT EXISTS jobs_first_seen_at ON jobs (first_seen_at)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS source_state (
    source TEXT PRIMARY KEY,
    backoff_until TEXT,
    last_success_at TEXT,
    last_error TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS job_events (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS job_events_job_id ON job_events (job_id, id)`,
  `CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    stats TEXT,
    error TEXT
  )`,
];

/**
 * Columns added after the first release. Applied with ALTER TABLE only when missing, so
 * existing rows and statuses are untouched.
 */
export const COLUMN_MIGRATIONS: ReadonlyArray<{ table: string; column: string; ddl: string }> = [
  { table: 'jobs', column: 'sources', ddl: 'sources TEXT' },
  { table: 'jobs', column: 'thin_description', ddl: 'thin_description INTEGER NOT NULL DEFAULT 0' },
  { table: 'jobs', column: 'primary_stack', ddl: 'primary_stack TEXT' },
  { table: 'jobs', column: 'fit_raw', ddl: 'fit_raw INTEGER' },
  { table: 'jobs', column: 'fit_notes', ddl: 'fit_notes TEXT' },
  { table: 'jobs', column: 'location_type', ddl: 'location_type TEXT' },
  { table: 'jobs', column: 'location_flag', ddl: "location_flag TEXT NOT NULL DEFAULT 'none'" },
  { table: 'jobs', column: 'filter_match', ddl: 'filter_match TEXT' },
  { table: 'jobs', column: 'stage', ddl: 'stage TEXT' },
  { table: 'jobs', column: 'stage_updated_at', ddl: 'stage_updated_at TEXT' },
  { table: 'jobs', column: 'notes', ddl: 'notes TEXT' },
  { table: 'jobs', column: 'role_type', ddl: "role_type TEXT NOT NULL DEFAULT 'frontend'" },
  { table: 'jobs', column: 'company_type', ddl: 'company_type TEXT' },
  { table: 'jobs', column: 'dream', ddl: 'dream INTEGER NOT NULL DEFAULT 0' },
  { table: 'jobs', column: 'description_hash', ddl: 'description_hash TEXT' },
];
