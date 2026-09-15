import { readFile } from 'node:fs/promises';
import { scoreResultSchema, type Job, type ScoreResult } from '@bench-press/shared';
import type { ChatClient } from '../llm/chat-client.ts';
import { errorMessage } from '../lib/logger.ts';

const PROMPT_PATH = new URL('../prompts/score.md', import.meta.url);

export async function loadScorePrompt(profile: string): Promise<string> {
  const template = await readFile(PROMPT_PATH, 'utf8');
  return template.replace('{{profile}}', profile.trim());
}

export function formatJobForScoring(
  job: Pick<Job, 'title' | 'company' | 'location' | 'salaryRaw' | 'description'>,
): string {
  return [
    `Title: ${job.title}`,
    `Company: ${job.company ?? 'unknown'}`,
    `Location: ${job.location ?? 'unknown'}`,
    `Salary: ${job.salaryRaw ?? 'not listed'}`,
    '',
    'Description:',
    job.description ?? '',
  ].join('\n');
}

/** Extracts the first JSON object from a completion, tolerating stray prose or code fences. */
export function parseScoreJson(raw: string): ScoreResult {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in completion');
  const parsed = scoreResultSchema.safeParse(JSON.parse(raw.slice(start, end + 1)));
  if (!parsed.success) throw new Error(`Score JSON failed validation: ${parsed.error.message}`);
  return parsed.data;
}

export async function scoreJob(
  job: Job,
  systemPrompt: string,
  chat: ChatClient,
  maxRetries: number,
): Promise<ScoreResult> {
  const user = formatJobForScoring(job);
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return parseScoreJson(await chat.completeJson(systemPrompt, user));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Scoring failed after ${maxRetries + 1} attempts: ${errorMessage(lastError)}`);
}
