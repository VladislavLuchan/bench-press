import { readFile } from 'node:fs/promises';
import {
  scoreResultListSchema,
  scoreResultSchema,
  type ChatClient,
  type Job,
  type LocationFlag,
  type RoleType,
  type ScoreResult,
  type TokenUsage,
  type ValidatedScore,
} from '@bench-press/shared';
import { config } from '../config.ts';
import { residencyLikely } from '../config/filters.ts';
import { errorMessage } from '../lib/logger.ts';

const PROMPT_PATH = new URL('../prompts/score.md', import.meta.url);

/** Stacks the candidate actually works in; anything else is capped in post-validation. */
const CORE_STACKS = new Set(['react', 'typescript', 'node']);
const OFF_STACK_MAX_FIT = 4;
const LOCATION_MAX_FIT: Partial<Record<ScoreResult['location_type'], number>> = {
  onsite: 2,
  hybrid: 4,
  remote_region_limited: 4,
};
/** A "gap" phrased as optional is not a gap; the model is told so, but does it anyway. */
const OPTIONAL_GAP = /\b(plus|nice[- ]to[- ]have|bonus|benefit|would be (great|nice)|optional)\b/i;
const MAX_FIT_AFTER_BONUS = 9;

export async function loadScorePrompt(profile: string, guidance: string | null): Promise<string> {
  const template = await readFile(PROMPT_PATH, 'utf8');
  return template
    .replace('{{profile}}', profile.trim())
    .replace('{{guidance}}', guidance?.trim() || 'None.');
}

export type ScorableJob = Pick<
  Job,
  | 'title'
  | 'company'
  | 'location'
  | 'salaryRaw'
  | 'source'
  | 'description'
  | 'locationFlag'
  | 'roleType'
>;

function contextOf(job: ScorableJob): ValidationContext {
  return {
    locationFlag: job.locationFlag,
    roleType: job.roleType,
    residencyLikely: residencyLikely(job.location, job.description),
  };
}

export function formatJobForScoring(job: ScorableJob): string {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company ?? 'unknown'}`,
    `Location: ${job.location ?? 'unknown'}`,
    `Salary: ${job.salaryRaw ?? 'not listed'}`,
    `Source: ${job.source}`,
    '',
    'Description:',
    job.description ?? '',
  ].join('\n');
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in completion');
  return JSON.parse(raw.slice(start, end + 1));
}

export interface ValidationContext {
  /** What the location regexes saw in the text. */
  locationFlag?: LocationFlag;
  /** Role breadth derived from the title. */
  roleType?: RoleType;
  /** One specific non-Ukrainian country in the listing and no "remote from anywhere" wording. */
  residencyLikely?: boolean;
}

/** "Gaps" that are not gaps: things the candidate already meets, and degrees. */
const NON_GAP = /candidate has|degree|bachelor|master/i;
const STAFF_MAX_FIT = 6;
const STAFF_OK_YEARS = 5;
const BACKEND_HEAVY_MAX_FIT = 5;
const OTHER_LANGUAGE_MAX_FIT = 3;
const RESIDENCY_MAX_FIT = 5;

/**
 * Code has the last word over the model. The model reports facts (company type, whether a
 * fullstack role is front-end focused, required years and languages); every bonus, penalty
 * and cap is applied here, once, in a fixed order: gap clean-up and bonuses, then one-point
 * penalties, then caps, so nothing can lift a job above a cap. Each change is recorded so
 * the dashboard can show "7 -> 4" and why. Company type never changes the fit, with one
 * exception: a recruiting agency that does not even describe the project.
 */
export function postValidate(raw: ScoreResult, context: ValidationContext = {}): ValidatedScore {
  const { locationFlag = 'none', roleType = 'frontend', residencyLikely = false } = context;
  const notes: string[] = [];
  let fit = raw.fit;

  const realGaps = raw.gaps.filter((gap) => !NON_GAP.test(gap));
  const gaps = realGaps.filter((gap) => !OPTIONAL_GAP.test(gap));
  const removed = realGaps.length - gaps.length;
  if (removed > 0) {
    const bonus = Math.min(MAX_FIT_AFTER_BONUS, fit + removed) - fit;
    if (bonus > 0) notes.push(`+${bonus}: ${removed} optional requirement(s) removed from gaps`);
    fit += bonus;
  }

  const penalty = (reason: string) => {
    if (fit <= 1) return;
    fit -= 1;
    notes.push(`-1: ${reason}`);
  };
  if (roleType === 'fullstack' && !raw.frontend_focused) {
    penalty('fullstack role without a stated front-end focus');
  }
  if (raw.company_type === 'agency' && !raw.has_project_description) {
    penalty('recruiting agency without any project description');
  }

  const cap = (max: number, reason: string) => {
    if (fit <= max) return;
    fit = max;
    notes.push(`capped at ${max}: ${reason}`);
  };

  let locationType = raw.location_type;
  const redFlags = [...raw.red_flags];
  if (residencyLikely && (locationType === 'remote' || locationType === 'unclear')) {
    locationType = 'remote_region_limited';
    redFlags.push('residency likely required');
    cap(RESIDENCY_MAX_FIT, 'listing names one country and never says remote from elsewhere');
  } else {
    const locationCap = LOCATION_MAX_FIT[locationType];
    if (locationCap !== undefined) cap(locationCap, `location is ${locationType}`);
  }
  if (!CORE_STACKS.has(raw.primary_stack)) {
    cap(OFF_STACK_MAX_FIT, `primary stack is ${raw.primary_stack}`);
  }
  if (roleType === 'fullstack' && raw.backend_heavy) {
    cap(BACKEND_HEAVY_MAX_FIT, 'fullstack role with required backend specifics');
  }
  if (
    roleType === 'staff' &&
    !(raw.years_required !== null && raw.years_required <= STAFF_OK_YEARS)
  ) {
    cap(STAFF_MAX_FIT, 'staff/principal/architect level without a stated 5 years or less');
  }
  if (raw.other_language_required) {
    cap(OTHER_LANGUAGE_MAX_FIT, `requires ${raw.other_language_required}`);
  }

  if (locationFlag === 'soft' && locationType === 'remote') {
    redFlags.push('verify location (hub mentioned)');
  }
  if (locationType === 'unclear' && !redFlags.some((flag) => /location unclear/i.test(flag))) {
    redFlags.push('location unclear');
  }

  const dream =
    raw.company_type === 'product' && locationType === 'remote' && raw.dream_signals.length > 0;

  return {
    score: { ...raw, fit, gaps, red_flags: redFlags, location_type: locationType },
    fitRaw: raw.fit,
    notes,
    dream,
  };
}

/** Parses a single-job answer, tolerating stray prose or code fences around the JSON. */
export function parseScoreJson(raw: string): ScoreResult {
  const parsed = scoreResultSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new Error(`Score JSON failed validation: ${parsed.error.message}`);
  return parsed.data;
}

/** Parses a batch answer; the array must have exactly one verdict per job. */
export function parseScoreBatchJson(raw: string, expected: number): ScoreResult[] {
  const data = extractJson(raw) as { results?: unknown };
  const parsed = scoreResultListSchema.safeParse(data.results);
  if (!parsed.success) throw new Error(`Batch JSON failed validation: ${parsed.error.message}`);
  if (parsed.data.length !== expected) {
    throw new Error(`Batch returned ${parsed.data.length} results for ${expected} jobs`);
  }
  return parsed.data;
}

export class UsageMeter {
  promptTokens = 0;
  completionTokens = 0;

  add(usage: TokenUsage | null): void {
    if (!usage) return;
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
  }

  /** Rough cost from the per-million prices in config; good enough to watch the trend. */
  estimatedUsd(): number {
    const { input, output } = config.scoring.usdPerMillionTokens;
    return (this.promptTokens * input + this.completionTokens * output) / 1_000_000;
  }
}

export async function scoreJob(
  job: ScorableJob,
  systemPrompt: string,
  chat: ChatClient,
  maxRetries: number,
  meter?: UsageMeter,
): Promise<ScoreResult> {
  const user = formatJobForScoring(job);
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await chat.complete(systemPrompt, user, { json: true });
      meter?.add(completion.usage);
      return parseScoreJson(completion.text);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Scoring failed after ${maxRetries + 1} attempts: ${errorMessage(lastError)}`);
}

export type BatchOutcome = { ok: true; score: ValidatedScore } | { ok: false; error: string };

/**
 * Scores several jobs in one request. If the batch answer is unusable (wrong length,
 * invalid JSON), every job in it falls back to an individual request.
 */
export async function scoreBatch(
  jobs: ScorableJob[],
  systemPrompt: string,
  chat: ChatClient,
  meter?: UsageMeter,
): Promise<BatchOutcome[]> {
  if (jobs.length === 1) {
    return [await scoreOne(jobs[0] as ScorableJob, systemPrompt, chat, meter)];
  }

  const user = jobs
    .map((job, index) => `### Job ${index + 1} of ${jobs.length}\n${formatJobForScoring(job)}`)
    .join('\n\n');
  try {
    const completion = await chat.complete(systemPrompt, user, {
      json: true,
      maxTokens: 1024 * jobs.length,
    });
    meter?.add(completion.usage);
    return parseScoreBatchJson(completion.text, jobs.length).map((raw, index) => {
      const job = jobs[index];
      return { ok: true, score: postValidate(raw, job ? contextOf(job) : {}) };
    });
  } catch {
    const results: BatchOutcome[] = [];
    for (const job of jobs) results.push(await scoreOne(job, systemPrompt, chat, meter));
    return results;
  }
}

async function scoreOne(
  job: ScorableJob,
  systemPrompt: string,
  chat: ChatClient,
  meter?: UsageMeter,
): Promise<BatchOutcome> {
  try {
    const raw = await scoreJob(job, systemPrompt, chat, config.scoring.maxRetries, meter);
    return { ok: true, score: postValidate(raw, contextOf(job)) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
