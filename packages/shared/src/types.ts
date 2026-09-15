export const SOURCE_NAMES = ['djinni', 'linkedin', 'dou', 'nofluffjobs'] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

export const JOB_STATUSES = ['new', 'applied', 'skipped', 'replied', 'filtered'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const SETTING_KEYS = [
  'profile',
  'cover_letter_template',
  'scoring_guidance',
  'fetch_requested_at',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

/** A listing as returned by a source module, before any processing. */
export interface JobListing {
  source: SourceName;
  externalId: string | null;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  salaryRaw: string | null;
  /** ISO 8601 timestamp, or null when the source does not expose a date. */
  postedAt: string | null;
  /** True when the source explicitly marks the job as remote; null when unknown. */
  remote: boolean | null;
}

/** Structured verdict produced by the scoring LLM. Field names match the prompt contract. */
export interface ScoreResult {
  fit: number;
  summary: string;
  matches: string[];
  gaps: string[];
  red_flags: string[];
  salary: string | null;
  remote: boolean;
  seniority: string;
  /** One word: react, vue, angular, backend, other. Drives the post-validation fit cap. */
  primary_stack: string;
}

/** A row of the `jobs` table. */
export interface Job {
  id: number;
  source: SourceName;
  /** Every source the same opening was seen on; `source` is the first one. */
  sources: SourceName[];
  externalId: string | null;
  url: string;
  canonicalUrl: string;
  dedupeKey: string;
  title: string;
  company: string | null;
  location: string | null;
  salaryRaw: string | null;
  description: string | null;
  describeAttempts: number;
  /** Description under the size threshold: scored anyway, but flagged for the reader. */
  thinDescription: boolean;
  postedAt: string | null;
  firstSeenAt: string;
  fit: number | null;
  summary: string | null;
  matches: string[];
  gaps: string[];
  redFlags: string[];
  salaryLlm: string | null;
  remote: boolean | null;
  seniority: string | null;
  primaryStack: string | null;
  scoredAt: string | null;
  scoreError: string | null;
  status: JobStatus;
  filterReason: string | null;
  coverLetter: string | null;
  coverLetterLang: string | null;
  coverLetterGeneratedAt: string | null;
  notifiedAt: string | null;
  appliedAt: string | null;
  repliedAt: string | null;
  updatedAt: string;
}

/** Lightweight job shape for list views: no description, no cover letter body. */
export type JobSummary = Omit<Job, 'description' | 'coverLetter'> & {
  hasCoverLetter: boolean;
};

/** Everything needed to insert a job that the scraper just discovered. */
export interface NewJob extends JobListing {
  canonicalUrl: string;
  dedupeKey: string;
  /** All sources the opening was seen on during this run; defaults to [source]. */
  sources?: SourceName[];
  description: string | null;
  thinDescription: boolean;
  status: Extract<JobStatus, 'new' | 'filtered'>;
  filterReason: string | null;
}

export interface SourceRunStats {
  listed: number;
  /** HTTP requests made to the board during this run. */
  requests: number;
  skipped: boolean;
  /** The board started refusing mid-run; listed jobs were still kept. */
  blocked: boolean;
  error: string | null;
}

export interface RunStats {
  sources: Partial<Record<SourceName, SourceRunStats>>;
  discovered: number;
  /** Unique after in-run and database dedupe. */
  unique: number;
  inserted: number;
  filtered: number;
  /** Rejected after reading the full description (salary, office-only). */
  descriptionFiltered: number;
  described: number;
  sentToScoring: number;
  scored: number;
  scoreErrors: number;
  notified: number;
  tokens: { prompt: number; completion: number; estimatedUsd: number } | null;
}

export interface Run {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  stats: RunStats | null;
  error: string | null;
}

export interface SourceState {
  source: SourceName;
  backoffUntil: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

/** Aggregates for the Stats page, computed in SQL. */
export interface DailyCount {
  day: string;
  count: number;
}

export interface ConversionRow {
  bucket: string;
  applied: number;
  replied: number;
}

export interface StatusTotals {
  new: number;
  applied: number;
  skipped: number;
  replied: number;
  filtered: number;
}

export interface DashboardStats {
  appliedPerDay: DailyCount[];
  appliedPerWeek: DailyCount[];
  bySource: ConversionRow[];
  byFit: ConversionRow[];
  totals: StatusTotals;
  appliedToday: number;
}
