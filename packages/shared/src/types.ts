export const SOURCE_NAMES = ['djinni', 'linkedin', 'dou', 'nofluffjobs'] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

export const JOB_STATUSES = ['new', 'applied', 'skipped', 'replied', 'filtered'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Pipeline board columns after a reply. `null` stage with status `applied` is the first column. */
export const JOB_STAGES = [
  'replied',
  'rejected',
  'advancing',
  'hr_interview',
  'tech_interview',
  'offer',
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export interface JobEvent {
  id: number;
  jobId: number;
  kind: 'status' | 'stage' | 'note';
  value: string;
  createdAt: string;
}

export const SETTING_KEYS = [
  'profile',
  'cover_letter_template',
  'scoring_guidance',
  'fetch_requested_at',
  'rescore_requested_at',
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
  location_type: LocationType;
  /** What kind of employer this is. Reported for filtering; it never changes the fit. */
  company_type: CompanyType;
  /** Fullstack roles only: the posting says the front end is the core of the job. */
  frontend_focused: boolean;
  /** Required (not optional) backend specifics: Go, Java, Kotlin, Python, K8s, microservices... */
  backend_heavy: boolean;
  /** Minimum years of experience stated as required, or null when the posting gives none. */
  years_required: number | null;
  /** A required human language other than English or Ukrainian, or null. */
  other_language_required: string | null;
  /** The posting describes the project or product the person would work on. */
  has_project_description: boolean;
  /** Which of the candidate's "dream" criteria the posting clearly meets. */
  dream_signals: string[];
}

export const ROLE_TYPES = ['frontend', 'fullstack', 'staff'] as const;
export type RoleType = (typeof ROLE_TYPES)[number];

export const COMPANY_TYPES = ['product', 'outsource', 'agency', 'unknown'] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const LOCATION_TYPES = [
  'remote',
  'remote_region_limited',
  'hybrid',
  'onsite',
  'unclear',
] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** What the regex pre-filter concluded from the text; `soft` means an office or hub was mentioned. */
export type LocationFlag = 'none' | 'soft';

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
  /** The model's fit before code post-validation; equals `fit` when nothing was adjusted. */
  fitRaw: number | null;
  /** Why post-validation changed the fit, one note per adjustment. */
  fitNotes: string[];
  summary: string | null;
  matches: string[];
  gaps: string[];
  redFlags: string[];
  salaryLlm: string | null;
  remote: boolean | null;
  seniority: string | null;
  primaryStack: string | null;
  /** Derived from the title in code: staff/principal/architect, fullstack, otherwise frontend. */
  roleType: RoleType;
  companyType: CompanyType | null;
  /** Product company, remote, and at least one dream signal. A badge, never part of fit. */
  dream: boolean;
  locationType: LocationType | null;
  locationFlag: LocationFlag;
  scoredAt: string | null;
  scoreError: string | null;
  status: JobStatus;
  stage: JobStage | null;
  stageUpdatedAt: string | null;
  /** Free-form notes: contacts, interview dates, impressions. */
  notes: string | null;
  filterReason: string | null;
  /** The phrase that triggered a regex filter, for reviewing false positives. */
  filterMatch: string | null;
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
  locationFlag: LocationFlag;
  roleType: RoleType;
  descriptionHash: string | null;
  status: Extract<JobStatus, 'new' | 'filtered'>;
  filterReason: string | null;
  filterMatch: string | null;
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
  /** Set on rescore runs: how many stored verdicts changed. */
  rescore?: { rescored: number; fitChanged: number; filtered: number; revived: number };
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
  /** Open (status new) jobs by role type and by company type. */
  byRoleType: Array<{ bucket: string; count: number }>;
  byCompanyType: Array<{ bucket: string; count: number }>;
}
