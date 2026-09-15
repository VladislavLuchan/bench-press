import type { ExistingJobRef, SourceName } from '@bench-press/shared';
import { dedupeKey } from '../lib/dedupe-key.ts';
import { normalizeUrl } from '../lib/normalize-url.ts';
import type { DiscoveredJob } from '../sources/types.ts';

export interface KeyedJob extends DiscoveredJob {
  canonicalUrl: string;
  dedupeKey: string;
  /** Every source this opening was seen on in this run; `source` is the first. */
  sources: SourceName[];
}

export function withKeys(job: DiscoveredJob): KeyedJob {
  return {
    ...job,
    canonicalUrl: normalizeUrl(job.url),
    dedupeKey: dedupeKey(job.title, job.company),
    sources: [job.source],
  };
}

function addSource(sources: SourceName[], source: SourceName): SourceName[] {
  return sources.includes(source) ? sources : [...sources, source];
}

/**
 * Removes duplicates within one run: first by canonical URL, then by title+company.
 * The first occurrence wins and collects the other sources, so order sources by preference.
 */
export function dedupeWithinRun(jobs: DiscoveredJob[]): KeyedJob[] {
  const byUrl = new Map<string, KeyedJob>();
  const byKey = new Map<string, KeyedJob>();
  const unique: KeyedJob[] = [];

  for (const job of jobs.map(withKeys)) {
    const existing = byUrl.get(job.canonicalUrl) ?? byKey.get(job.dedupeKey);
    if (existing) {
      existing.sources = addSource(existing.sources, job.source);
      existing.description ??= job.description;
      continue;
    }
    byUrl.set(job.canonicalUrl, job);
    byKey.set(job.dedupeKey, job);
    unique.push(job);
  }
  return unique;
}

export interface ExcludeResult {
  fresh: KeyedJob[];
  /** Stored jobs that were seen again on a source not yet recorded for them. */
  sourceUpdates: Array<{ id: number; sources: SourceName[] }>;
}

/** Splits jobs into unseen ones and source updates for jobs the database already has. */
export function excludeExisting(
  jobs: KeyedJob[],
  existing: { canonicalUrls: Map<string, ExistingJobRef>; dedupeKeys: Map<string, ExistingJobRef> },
): ExcludeResult {
  const fresh: KeyedJob[] = [];
  const updates = new Map<number, SourceName[]>();

  for (const job of jobs) {
    const known =
      existing.canonicalUrls.get(job.canonicalUrl) ?? existing.dedupeKeys.get(job.dedupeKey);
    if (!known) {
      fresh.push(job);
      continue;
    }
    let merged = updates.get(known.id) ?? known.sources;
    for (const source of job.sources) merged = addSource(merged, source);
    if (merged.length !== known.sources.length) updates.set(known.id, merged);
  }

  return {
    fresh,
    sourceUpdates: [...updates].map(([id, sources]) => ({ id, sources })),
  };
}
