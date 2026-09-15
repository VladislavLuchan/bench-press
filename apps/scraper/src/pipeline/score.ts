import { readFile } from 'node:fs/promises';
import {
  scoreResultListSchema,
  scoreResultSchema,
  type ChatClient,
  type Job,
  type ScoreResult,
  type TokenUsage,
} from '@bench-press/shared';
import { config } from '../config.ts';
import { errorMessage } from '../lib/logger.ts';

const PROMPT_PATH = new URL('../prompts/score.md', import.meta.url);

/** Stacks the candidate actually works in; anything else is capped by `applyStackCap`. */
const CORE_STACKS = new Set(['react', 'typescript', 'node', 'javascript', 'frontend']);
const OFF_STACK_MAX_FIT = 4;

export async function loadScorePrompt(profile: string, guidance: string | null): Promise<string> {
  const template = await readFile(PROMPT_PATH, 'utf8');
  return template
    .replace('{{profile}}', profile.trim())
    .replace('{{guidance}}', guidance?.trim() || 'None.');
}

export type ScorableJob = Pick<
  Job,
  'title' | 'company' | 'location' | 'salaryRaw' | 'source' | 'description'
>;

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

/** The model's verdict is advisory on stack: an off-stack role can never score above 4. */
export function applyStackCap(score: ScoreResult): ScoreResult {
  if (CORE_STACKS.has(score.primary_stack)) return score;
  return { ...score, fit: Math.min(score.fit, OFF_STACK_MAX_FIT) };
}

/** Parses a single-job answer, tolerating stray prose or code fences around the JSON. */
export function parseScoreJson(raw: string): ScoreResult {
  const parsed = scoreResultSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new Error(`Score JSON failed validation: ${parsed.error.message}`);
  return applyStackCap(parsed.data);
}

/** Parses a batch answer; the array must have exactly one verdict per job. */
export function parseScoreBatchJson(raw: string, expected: number): ScoreResult[] {
  const data = extractJson(raw) as { results?: unknown };
  const parsed = scoreResultListSchema.safeParse(data.results);
  if (!parsed.success) throw new Error(`Batch JSON failed validation: ${parsed.error.message}`);
  if (parsed.data.length !== expected) {
    throw new Error(`Batch returned ${parsed.data.length} results for ${expected} jobs`);
  }
  return parsed.data.map(applyStackCap);
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

export type BatchOutcome = { ok: true; score: ScoreResult } | { ok: false; error: string };

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
    return parseScoreBatchJson(completion.text, jobs.length).map((score) => ({ ok: true, score }));
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
    return {
      ok: true,
      score: await scoreJob(job, systemPrompt, chat, config.scoring.maxRetries, meter),
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
