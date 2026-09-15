import {
  addJobSources,
  createChatClient,
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
  markFiltered,
  markNotified,
  markSourceBackoff,
  markSourceSuccess,
  recordDescribeFailure,
  saveDescription,
  saveScore,
  saveScoreError,
  startRun,
  type Db,
  type Job,
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
import { fetchDescription, fetchListings } from '../sources/fetch.ts';
import { sources } from '../sources/index.ts';
import type { DiscoveredJob, Source } from '../sources/types.ts';
import { dedupeWithinRun, excludeExisting, type KeyedJob } from './dedupe.ts';
import { formatJobMessage, sendTelegramMessage } from './notify.ts';
import { descriptionVerdict, prefilterReason } from './prefilter.ts';
import { loadScorePrompt, scoreBatch, UsageMeter } from './score.ts';

function emptyStats(): RunStats {
  return {
    sources: {},
    discovered: 0,
    unique: 0,
    inserted: 0,
    filtered: 0,
    descriptionFiltered: 0,
    described: 0,
    sentToScoring: 0,
    scored: 0,
    scoreErrors: 0,
    notified: 0,
    tokens: null,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Step 1: every source in parallel; one failing source never stops the others. */
async function discover(
  http: HttpClient,
  stats: RunStats,
  db: Db | null,
  backfill: boolean,
): Promise<DiscoveredJob[]> {
  const states = db ? await getSourceStates(db) : new Map<SourceName, SourceState>();
  const now = new Date().toISOString();

  const results = await Promise.all(
    sources.map(async (source): Promise<DiscoveredJob[]> => {
      const backoffUntil = states.get(source.name)?.backoffUntil;
      if (backoffUntil && backoffUntil > now) {
        log.warn(`Skipping ${source.name}: backing off until ${backoffUntil}`);
        stats.sources[source.name] = { listed: 0, requests: 0, skipped: true, blocked: false, error: null };
        return [];
      }
      try {
        const result = await fetchListings(source, http, { backfill });
        stats.sources[source.name] = {
          listed: result.jobs.length,
          requests: result.requests,
          skipped: false,
          blocked: result.blocked !== null,
          error: result.blocked?.message ?? null,
        };
        if (result.blocked) {
          log.warn(`Source ${source.name} blocked mid-run`, { error: result.blocked.message });
          if (db) await backOff(db, source.name, result.blocked);
        } else if (db) {
          await markSourceSuccess(db, source.name);
        }
        log.info(`Fetched ${source.name}`, { listed: result.jobs.length, requests: result.requests });
        return result.jobs;
      } catch (error) {
        const message = errorMessage(error);
        stats.sources[source.name] = { listed: 0, requests: 0, skipped: false, blocked: false, error: message };
        log.error(`Source ${source.name} failed`, { error: message });
        if (db && error instanceof BlockedError) await backOff(db, source.name, error);
        return [];
      }
    }),
  );
  return results.flat();
}

async function backOff(db: Db, source: SourceName, error: BlockedError): Promise<void> {
  const until = new Date(Date.now() + config.sourceBackoffHours * 3_600_000).toISOString();
  await markSourceBackoff(db, source, { until, error: error.message });
}

/** Steps 2-3: dedupe against the run and the database, then prefilter. */
async function prepareNewJobs(
  discovered: DiscoveredJob[],
  db: Db | null,
  stats: RunStats,
): Promise<NewJob[]> {
  let unique: KeyedJob[] = dedupeWithinRun(discovered);
  if (db) {
    const existing = await findExistingJobKeys(db, {
      canonicalUrls: unique.map((job) => job.canonicalUrl),
      dedupeKeys: unique.map((job) => job.dedupeKey),
    });
    const { fresh, sourceUpdates } = excludeExisting(unique, existing);
    await addJobSources(db, sourceUpdates);
    unique = fresh;
  }
  stats.unique = unique.length;

  return unique.map((job) => {
    let reason = prefilterReason(job);
    let thin = false;
    if (!reason && job.description) {
      const verdict = descriptionVerdict(job, job.description);
      reason = verdict.reason;
      thin = verdict.thin;
      if (reason) stats.descriptionFiltered++;
    }
    return {
      ...job,
      status: reason ? 'filtered' : 'new',
      filterReason: reason,
      // Filtered rows are kept only for dedupe; their description would be dead weight.
      description: reason ? null : job.description,
      thinDescription: thin,
    };
  });
}

function sourceByName(name: SourceName): Source {
  const source = sources.find((candidate) => candidate.name === name);
  if (!source) throw new Error(`Unknown source ${name}`);
  return source;
}

/** Step 4: fetch full descriptions, then apply the description-level checks. */
async function describeJobs(db: Db, http: HttpClient, stats: RunStats): Promise<void> {
  const pending = await findJobsMissingDescription(db, {
    maxAttempts: config.describe.maxAttempts,
    limit: config.describe.perRunLimit,
  });
  for (const job of pending) {
    try {
      const description = await fetchDescription(sourceByName(job.source), job, http);
      if (!description) {
        await recordDescribeFailure(db, job.id);
        continue;
      }
      const verdict = descriptionVerdict(job, description);
      if (verdict.reason) {
        await markFiltered(db, job.id, verdict.reason);
        stats.descriptionFiltered++;
        continue;
      }
      await saveDescription(db, job.id, description, { thin: verdict.thin });
      stats.described++;
    } catch (error) {
      await recordDescribeFailure(db, job.id);
      log.warn(`Description fetch failed for job ${job.id}`, { error: errorMessage(error) });
      if (error instanceof BlockedError) break;
    }
  }
}

/** Step 5: LLM scoring in batches for jobs that have a description but no verdict yet. */
async function scoreJobs(db: Db, env: ScraperEnv, stats: RunStats): Promise<void> {
  const [profile, guidance] = await Promise.all([
    getSetting(db, 'profile'),
    getSetting(db, 'scoring_guidance'),
  ]);
  if (!profile) {
    log.warn('No profile in settings; skipping scoring. Add it on the dashboard Settings page.');
    return;
  }
  const pending: Job[] = await findJobsToScore(db, config.scoring.perRunLimit);
  stats.sentToScoring = pending.length;
  if (pending.length === 0) return;

  const chat = createChatClient({
    apiKey: env.llmApiKey,
    model: config.scoring.model,
    baseUrl: config.scoring.baseUrl,
  });
  const systemPrompt = await loadScorePrompt(profile, guidance);
  const meter = new UsageMeter();

  await mapWithConcurrency(chunk(pending, config.scoring.batchSize), config.scoring.concurrency, async (batch) => {
    const outcomes = await scoreBatch(batch, systemPrompt, chat, meter);
    for (const [index, outcome] of outcomes.entries()) {
      const job = batch[index] as Job;
      if (outcome.ok) {
        await saveScore(db, job.id, outcome.score);
        stats.scored++;
      } else {
        await saveScoreError(db, job.id, outcome.error);
        stats.scoreErrors++;
        log.warn(`Scoring failed for job ${job.id}`, { error: outcome.error });
      }
    }
  });

  stats.tokens = {
    prompt: meter.promptTokens,
    completion: meter.completionTokens,
    estimatedUsd: Number(meter.estimatedUsd().toFixed(4)),
  };
}

/** Step 6: Telegram for high-fit jobs that have not been announced yet. */
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

function logStage(stage: string, stats: RunStats): void {
  log.info(`Stage ${stage}`, {
    discovered: stats.discovered,
    unique: stats.unique,
    inserted: stats.inserted,
    filtered: stats.filtered,
    descriptionFiltered: stats.descriptionFiltered,
    described: stats.described,
    sentToScoring: stats.sentToScoring,
    scored: stats.scored,
    scoreErrors: stats.scoreErrors,
    notified: stats.notified,
  });
}

export interface RunOptions {
  http: HttpClient;
  env: ScraperEnv | null;
  dryRun: boolean;
  backfill: boolean;
}

/** Full pipeline. In dry-run mode nothing is written and no LLM or Telegram call is made. */
export async function runPipeline({ http, env, dryRun, backfill }: RunOptions): Promise<RunStats> {
  const stats = emptyStats();

  if (dryRun || !env) {
    const discovered = await discover(http, stats, null, backfill);
    stats.discovered = discovered.length;
    const prepared = await prepareNewJobs(discovered, null, stats);
    for (const job of prepared) {
      log.info(`${job.status.padEnd(8)} ${job.source.padEnd(11)} ${job.title} @ ${job.company ?? '?'}`, {
        reason: job.filterReason,
        sources: job.sources,
        url: job.canonicalUrl,
      });
    }
    stats.filtered = prepared.filter((job) => job.status === 'filtered').length;
    logStage('dry run finished', stats);
    return stats;
  }

  const db = await createDb({ url: env.tursoUrl, authToken: env.tursoAuthToken });
  await ensureSchema(db);
  const runId = await startRun(db);

  try {
    const discovered = await discover(http, stats, db, backfill);
    stats.discovered = discovered.length;

    const prepared = await prepareNewJobs(discovered, db, stats);
    stats.inserted = await insertJobs(db, prepared);
    stats.filtered = prepared.filter((job) => job.status === 'filtered').length;
    logStage('collected', stats);

    await describeJobs(db, http, stats);
    logStage('described', stats);

    await scoreJobs(db, env, stats);
    logStage('scored', stats);
    if (stats.tokens) log.info('Scoring usage', stats.tokens);

    await notifyMatches(db, env, stats);

    await finishRun(db, runId, { stats, error: null });
    logStage('run finished', stats);
    return stats;
  } catch (error) {
    await finishRun(db, runId, { stats, error: errorMessage(error) });
    throw error;
  }
}
