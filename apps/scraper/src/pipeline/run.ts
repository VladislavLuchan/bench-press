import {
  addJobSources,
  createChatClient,
  createDb,
  ensureSchema,
  findDuplicateDescription,
  findExistingJobKeys,
  findJobsMissingDescription,
  findJobsToNotify,
  findJobsToRescore,
  findJobsToScore,
  finishRun,
  getSetting,
  getSourceStates,
  insertJobs,
  listJobsForRefilter,
  markFiltered,
  markNotified,
  markSourceBackoff,
  markSourceSuccess,
  recordDescribeFailure,
  reviveJob,
  saveDescription,
  saveScore,
  saveScoreError,
  setDescriptionHash,
  startRun,
  updateLocationFlag,
  updateRoleTypes,
  type Db,
  type Job,
  type NewJob,
  type RunStats,
  type SourceName,
  type SourceState,
} from '@bench-press/shared';
import { config } from '../config.ts';
import { roleTypeOf } from '../config/filters.ts';
import type { ScraperEnv } from '../env.ts';
import { mapWithConcurrency } from '../lib/concurrency.ts';
import { descriptionHash } from '../lib/description-hash.ts';
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
        stats.sources[source.name] = {
          listed: 0,
          requests: 0,
          skipped: true,
          blocked: false,
          error: null,
        };
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
        log.info(`Fetched ${source.name}`, {
          listed: result.jobs.length,
          requests: result.requests,
        });
        return result.jobs;
      } catch (error) {
        const message = errorMessage(error);
        stats.sources[source.name] = {
          listed: 0,
          requests: 0,
          skipped: false,
          blocked: false,
          error: message,
        };
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

  // Same company, same description text under another title: keep the first copy only.
  const seenDescriptions = new Set<string>();

  const prepared: NewJob[] = [];
  for (const job of unique) {
    let reason = prefilterReason(job);
    let match: string | null = null;
    let thin = false;
    let locationFlag: NewJob['locationFlag'] = 'none';
    const hash = job.description ? descriptionHash(job.description) : null;
    if (!reason && hash && job.company) {
      const key = `${job.company.toLowerCase()}|${hash}`;
      const duplicateOf =
        seenDescriptions.has(key) ||
        (db && (await findDuplicateDescription(db, { id: null, company: job.company, hash })));
      if (duplicateOf) reason = 'duplicate description';
      seenDescriptions.add(key);
    }
    if (!reason) {
      // Without a description only the title and location field can be checked.
      const verdict = descriptionVerdict(job, job.description ?? '');
      reason = verdict.reason;
      match = verdict.match;
      thin = job.description ? verdict.thin : false;
      locationFlag = verdict.locationFlag;
      if (reason) stats.descriptionFiltered++;
    }
    prepared.push({
      ...job,
      status: reason ? 'filtered' : 'new',
      filterReason: reason,
      filterMatch: match,
      // Filtered rows are kept only for dedupe; their description would be dead weight.
      description: reason ? null : job.description,
      descriptionHash: reason ? null : hash,
      thinDescription: thin,
      locationFlag,
      roleType: roleTypeOf(job.title),
    });
  }
  return prepared;
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
        await markFiltered(db, job.id, { reason: verdict.reason, match: verdict.match });
        stats.descriptionFiltered++;
        continue;
      }
      const hash = descriptionHash(description);
      const duplicateOf = await findDuplicateDescription(db, {
        id: job.id,
        company: job.company,
        hash,
      });
      if (duplicateOf) {
        await markFiltered(db, job.id, {
          reason: 'duplicate description',
          match: `job ${duplicateOf}`,
        });
        stats.descriptionFiltered++;
        continue;
      }
      await saveDescription(db, job.id, description, {
        thin: verdict.thin,
        locationFlag: verdict.locationFlag,
        hash,
      });
      stats.described++;
    } catch (error) {
      await recordDescribeFailure(db, job.id);
      log.warn(`Description fetch failed for job ${job.id}`, { error: errorMessage(error) });
      if (error instanceof BlockedError) break;
    }
  }
}

/** Step 5: LLM scoring in batches for jobs that have a description but no verdict yet. */
async function scoreJobs(
  db: Db,
  env: ScraperEnv,
  stats: RunStats,
  pending: Job[],
  onScored?: (job: Job, fit: number) => void,
): Promise<void> {
  const [profile, guidance] = await Promise.all([
    getSetting(db, 'profile'),
    getSetting(db, 'scoring_guidance'),
  ]);
  if (!profile) {
    log.warn('No profile in settings; skipping scoring. Add it on the dashboard Settings page.');
    return;
  }
  stats.sentToScoring = pending.length;
  if (pending.length === 0) return;

  const chat = createChatClient({
    apiKey: env.llmApiKey,
    model: config.scoring.model,
    baseUrl: config.scoring.baseUrl,
  });
  const systemPrompt = await loadScorePrompt(profile, guidance);
  const meter = new UsageMeter();

  await mapWithConcurrency(
    chunk(pending, config.scoring.batchSize),
    config.scoring.concurrency,
    async (batch) => {
      const outcomes = await scoreBatch(batch, systemPrompt, chat, meter);
      for (const [index, outcome] of outcomes.entries()) {
        const job = batch[index] as Job;
        if (outcome.ok) {
          await saveScore(db, job.id, outcome.score);
          stats.scored++;
          onScored?.(job, outcome.score.score.fit);
        } else {
          await saveScoreError(db, job.id, outcome.error);
          stats.scoreErrors++;
          log.warn(`Scoring failed for job ${job.id}`, { error: outcome.error });
        }
      }
    },
  );

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

/** Reasons produced from the listing alone; description-based ones cannot be re-checked. */
function isTitleLevelReason(reason: string | null): boolean {
  return Boolean(reason) && !/^(on-site|description:|duplicate description)/.test(reason ?? '');
}

/** Whether a job filtered as too old would pass the current, per-source age limit. */
function withinAge(job: { source: string; postedAt: string | null; firstSeenAt: string }): boolean {
  if (!job.postedAt) return true;
  const limit = config.prefilter.maxAgeDaysBySource[job.source] ?? config.prefilter.maxAgeDays;
  const ageAtDiscovery =
    (new Date(job.firstSeenAt).getTime() - new Date(job.postedAt).getTime()) / 86_400_000;
  return ageAtDiscovery <= limit;
}

/**
 * Re-evaluates every open, described job under the current filters, prompt and
 * post-validation. Applied, replied and skipped jobs are never touched. Runs as its own
 * `runs` row so the outcome is visible on the Stats page.
 */
export async function rescoreAll(env: ScraperEnv): Promise<RunStats> {
  const stats = emptyStats();
  const db = await createDb({ url: env.tursoUrl, authToken: env.tursoAuthToken });
  await ensureSchema(db);
  const runId = await startRun(db);

  try {
    // 1. Title-level rules for every open or filtered row: role type, blacklist, language,
    //    new exclude words. Rows that pass now but were filtered before go back to `new`
    //    (their description is fetched by the next regular run). Age is not re-checked.
    const listed = await listJobsForRefilter(db);
    await updateRoleTypes(
      db,
      listed
        .filter((job) => roleTypeOf(job.title) !== job.roleType)
        .map((job) => ({ id: job.id, roleType: roleTypeOf(job.title) })),
    );
    let revived = 0;
    const reasons = new Map<string, number>();
    const count = (reason: string) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    for (const job of listed) {
      const reason = prefilterReason(job, config.prefilter, new Date(), false);
      if (job.status === 'new' && reason) {
        await markFiltered(db, job.id, { reason, match: null });
        stats.filtered++;
        count(reason.split('"')[0]!.trim());
      } else if (job.status === 'filtered' && !reason && isTitleLevelReason(job.filterReason)) {
        const fresh =
          !job.postedAt || !/^older than/.test(job.filterReason ?? '') || withinAge(job);
        if (fresh) {
          await reviveJob(db, job.id);
          revived++;
        }
      }
    }

    // 2. Description-level rules and duplicates for open jobs, then the LLM.
    const jobs = await findJobsToRescore(db, config.rescore.limit);
    const previousFit = new Map(jobs.map((job) => [job.id, job.fit]));
    const toScore: Job[] = [];
    const seenDescriptions = new Set<string>();

    for (const job of jobs) {
      const verdict = descriptionVerdict(job, job.description ?? '');
      const hash = descriptionHash(job.description ?? '');
      const key = `${(job.company ?? '').toLowerCase()}|${hash}`;
      const duplicate = Boolean(job.company) && seenDescriptions.has(key);
      seenDescriptions.add(key);
      const reason = verdict.reason ?? (duplicate ? 'duplicate description' : null);
      if (reason) {
        await markFiltered(db, job.id, { reason, match: verdict.match });
        stats.descriptionFiltered++;
        stats.filtered++;
        count(reason);
        continue;
      }
      await setDescriptionHash(db, job.id, hash);
      if (verdict.locationFlag !== job.locationFlag) {
        await updateLocationFlag(db, job.id, verdict.locationFlag);
      }
      toScore.push({ ...job, locationFlag: verdict.locationFlag, roleType: roleTypeOf(job.title) });
    }
    log.info('Rescore refilter', {
      revived,
      filtered: stats.filtered,
      reasons: Object.fromEntries(reasons),
    });

    let fitChanged = 0;
    await scoreJobs(db, env, stats, toScore, (job, fit) => {
      if (previousFit.get(job.id) !== fit) fitChanged++;
    });
    stats.rescore = { rescored: stats.scored, fitChanged, filtered: stats.filtered, revived };
    if (stats.tokens) log.info('Scoring usage', stats.tokens);

    await finishRun(db, runId, { stats, error: null });
    log.info('Rescore finished', { ...stats.rescore, scoreErrors: stats.scoreErrors });
    return stats;
  } catch (error) {
    await finishRun(db, runId, { stats, error: errorMessage(error) });
    throw error;
  }
}

/** Full pipeline. In dry-run mode nothing is written and no LLM or Telegram call is made. */
export async function runPipeline({ http, env, dryRun, backfill }: RunOptions): Promise<RunStats> {
  const stats = emptyStats();

  if (dryRun || !env) {
    const discovered = await discover(http, stats, null, backfill);
    stats.discovered = discovered.length;
    const prepared = await prepareNewJobs(discovered, null, stats);
    for (const job of prepared) {
      log.info(
        `${job.status.padEnd(8)} ${job.source.padEnd(11)} ${job.title} @ ${job.company ?? '?'}`,
        {
          reason: job.filterReason,
          sources: job.sources,
          url: job.canonicalUrl,
        },
      );
    }
    stats.filtered = prepared.filter((job) => job.status === 'filtered').length;
    for (const source of sources) {
      const own = prepared.filter((job) => job.source === source.name);
      const reasons: Record<string, number> = {};
      for (const job of own) {
        if (!job.filterReason) continue;
        const reason = job.filterReason.split('"')[0]!.trim();
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      log.info(`Summary ${source.name}`, {
        listed: stats.sources[source.name]?.listed ?? 0,
        unique: own.length,
        passed: own.filter((job) => job.status === 'new').length,
        filteredBy: reasons,
      });
    }
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

    await scoreJobs(db, env, stats, await findJobsToScore(db, config.scoring.perRunLimit));
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
