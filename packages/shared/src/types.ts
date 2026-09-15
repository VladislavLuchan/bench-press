export const SOURCE_NAMES = ['djinni', 'linkedin', 'dou'] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

export const JOB_STATUSES = ['new', 'applied', 'skipped', 'replied', 'filtered'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const SETTING_KEYS = ['profile', 'cover_letter_template'] as const;
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
}

/** A row of the `jobs` table. */
export interface Job {
  id: number;
  source: SourceName;
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
  description: string | null;
  status: Extract<JobStatus, 'new' | 'filtered'>;
  filterReason: string | null;
}

export interface SourceRunStats {
  listed: number;
  skipped: boolean;
  error: string | null;
}

export interface RunStats {
  sources: Partial<Record<SourceName, SourceRunStats>>;
  discovered: number;
  inserted: number;
  filtered: number;
  described: number;
  scored: number;
  scoreErrors: number;
  notified: number;
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
