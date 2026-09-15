import {
  createDb,
  ensureSchema,
  findExistingJobKeys,
  findJobsMissingDescription,
  findJobsToNotify,
  findJobsToScore,
  finishRun,
  getSetting,
  getSourceStates,
  insertJobs,
  markNotified,
  markSourceBackoff,
  markSourceSuccess,
  recordDescribeFailure,
  saveDescription,
  saveScore,
  saveScoreError,
  startRun,
  type Db,
  type NewJob,
  type RunStats,
  type SourceName,
  type SourceState,
} from '@bench-press/shared';
import { config } from '../config.ts';
import type { ScraperEnv } from '../env.ts';
import { mapWithConcurrency } from '../lib/concurrency.ts';
import { BlockedError, type HttpClient } from '../lib/http.ts';
import { errorMessage, log } from '../lib/logger.ts';
import { createDeepSeekClient } from '../llm/deepseek.ts';
import { fetchDescription, fetchListings } from '../sources/fetch.ts';
import { sources } from '../sources/index.ts';
import type { DiscoveredJob, Source } from '../sources/types.ts';
import { dedupeWithinRun, excludeExisting, type KeyedJob } from './dedupe.ts';
import { formatJobMessage, sendTelegramMessage } from './notify.ts';
import { prefilterReason } from './prefilter.ts';
import { loadScorePrompt, scoreJob } from './score.ts';

function emptyStats(): RunStats {
  return {
    sources: {},
    discovered: 0,
    inserted: 0,
    filtered: 0,
    described: 0,
    scored: 0,
    scoreErrors: 0,
    notified: 0,
  };
}

/** Step 1: every source in parallel; one failing source never stops the others. */
async function discover(
  http: HttpClient,
  stats: RunStats,
  db: Db | null,
): Promise<DiscoveredJob[]> {
  const states = db ? await getSourceStates(db) : new Map<SourceName, SourceState>();
  const now = new Date().toISOString();

  const results = await Promise.all(
    sources.map(async (source): Promise<DiscoveredJob[]> => {
      const backoffUntil = states.get(source.name)?.backoffUntil;
      if (backoffUntil && backoffUntil > now) {
        log.warn(`Skipping ${source.name}: backing off until ${backoffUntil}`);
        stats.sources[source.name] = { listed: 0, skipped: true, error: null };
        return [];
      }
      try {
        const jobs = await fetchListings(source, http);
        stats.sources[source.name] = { listed: jobs.length, skipped: false, error: null };
        if (db) await markSourceSuccess(db, source.name);
        log.info(`Fetched ${source.name}`, { listed: jobs.length });
        return jobs;
      } catch (error) {
        const message = errorMessage(error);
        stats.sources[source.name] = { listed: 0, skipped: false, error: message };
        log.error(`Source ${source.name} failed`, { error: message });
        if (db && error instanceof BlockedError) {
          const until = new Date(Date.now() + config.sourceBackoffHours * 3_600_000).toISOString();
          await markSourceBackoff(db, source.name, { until, error: message });
        }
        return [];
      }
    }),
  );
  return results.flat();
}

/** Steps 2-4: dedupe, prefilter, insert. Returns rows ready to be written. */
async function prepareNewJobs(discovered: DiscoveredJob[], db: Db | null): Promise<NewJob[]> {
  let unique: KeyedJob[] = dedupeWithinRun(discovered);
  if (db) {
    const existing = await findExistingJobKeys(db, {
      canonicalUrls: unique.map((job) => job.canonicalUrl),
      dedupeKeys: unique.map((job) => job.dedupeKey),
    });
    unique = excludeExisting(unique, existing);
  }

  return unique.map((job) => {
    const reason = prefilterReason(job);
    return {
      ...job,
      status: reason ? 'filtered' : 'new',
      filterReason: reason,
      // Filtered rows are kept only for dedupe; their description would be dead weight.
      description: reason ? null : job.description,
    };
  });
}

function sourceByName(name: SourceName): Source {
  const source = sources.find((candidate) => candidate.name === name);
  if (!source) throw new Error(`Unknown source ${name}`);
  return source;
}

/** Step 5: fetch full descriptions for new jobs that lack one. */
async function describeJobs(db: Db, http: HttpClient, stats: RunStats): Promise<void> {
  const pending = await findJobsMissingDescription(db, {
    maxAttempts: config.describe.maxAttempts,
    limit: config.describe.perRunLimit,
  });
  for (const job of pending) {
    try {
      const description = await fetchDescription(sourceByName(job.source), job, http);
      if (description) {
        await saveDescription(db, job.id, description);
        stats.described++;
      } else {
        await recordDescribeFailure(db, job.id);
      }
    } catch (error) {
      await recordDescribeFailure(db, job.id);
      log.warn(`Description fetch failed for job ${job.id}`, { error: errorMessage(error) });
      if (error instanceof BlockedError) break;
    }
  }
}

/** Step 6: LLM scoring for jobs that have a description but no verdict yet. */
async function scoreJobs(db: Db, env: ScraperEnv, stats: RunStats): Promise<void> {
  const profile = await getSetting(db, 'profile');
  if (!profile) {
    log.warn('No profile in settings; skipping scoring. Add it on the dashboard Settings page.');
    return;
  }
  const pending = await findJobsToScore(db, config.scoring.perRunLimit);
  if (pending.length === 0) return;

  const chat = createDeepSeekClient({ apiKey: env.deepseekApiKey, model: config.scoring.model });
  const systemPrompt = await loadScorePrompt(profile);

  await mapWithConcurrency(pending, config.scoring.concurrency, async (job) => {
    try {
      const score = await scoreJob(job, systemPrompt, chat, config.scoring.maxRetries);
      await saveScore(db, job.id, score);
      stats.scored++;
    } catch (error) {
      await saveScoreError(db, job.id, errorMessage(error));
      stats.scoreErrors++;
      log.warn(`Scoring failed for job ${job.id}`, { error: errorMessage(error) });
    }
  });
}

/** Step 7: Telegram for high-fit jobs that have not been announced yet. */
async function notifyMatches(db: Db, env: ScraperEnv, stats: RunStats): Promise<void> {
  if (!env.telegramBotToken || !env.telegramChatId) return;
  const matches = await findJobsToNotify(db, config.notify.minFit);
  const telegram = {
    botToken: env.telegramBotToken,
    chatId: env.telegramChatId,
    dashboardUrl: env.dashboardUrl,
  };
  for (const job of matches) {
    await sendTelegramMessage(telegram, formatJobMessage(job, env.dashboardUrl));
    await markNotified(db, [job.id]);
    stats.notified++;
  }
}

export interface RunOptions {
  http: HttpClient;
  env: ScraperEnv | null;
  dryRun: boolean;
}

/** Full pipeline. In dry-run mode nothing is written and no LLM or Telegram call is made. */
export async function runPipeline({ http, env, dryRun }: RunOptions): Promise<RunStats> {
  const stats = emptyStats();

  if (dryRun || !env) {
    const discovered = await discover(http, stats, null);
    stats.discovered = discovered.length;
    const prepared = await prepareNewJobs(discovered, null);
    for (const job of prepared) {
      log.info(
        `${job.status.padEnd(8)} ${job.source.padEnd(8)} ${job.title} @ ${job.company ?? '?'}`,
        {
          reason: job.filterReason,
          url: job.canonicalUrl,
        },
      );
    }
    stats.filtered = prepared.filter((job) => job.status === 'filtered').length;
    log.info('Dry run finished', { ...stats });
    return stats;
  }

  const db = createDb({ url: env.tursoUrl, authToken: env.tursoAuthToken });
  await ensureSchema(db);
  const runId = await startRun(db);

  try {
    const discovered = await discover(http, stats, db);
    stats.discovered = discovered.length;

    const prepared = await prepareNewJobs(discovered, db);
    stats.inserted = await insertJobs(db, prepared);
    stats.filtered = prepared.filter((job) => job.status === 'filtered').length;

    await describeJobs(db, http, stats);
    await scoreJobs(db, env, stats);
    await notifyMatches(db, env, stats);

    await finishRun(db, runId, { stats, error: null });
    log.info('Run finished', { ...stats });
    return stats;
  } catch (error) {
    await finishRun(db, runId, { stats, error: errorMessage(error) });
    throw error;
  }
}
