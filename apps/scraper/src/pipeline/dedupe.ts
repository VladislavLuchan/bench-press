import { dedupeKey } from '../lib/dedupe-key.ts';
import { normalizeUrl } from '../lib/normalize-url.ts';
import type { DiscoveredJob } from '../sources/types.ts';

export interface KeyedJob extends DiscoveredJob {
  canonicalUrl: string;
  dedupeKey: string;
}

export function withKeys(job: DiscoveredJob): KeyedJob {
  return {
    ...job,
    canonicalUrl: normalizeUrl(job.url),
    dedupeKey: dedupeKey(job.title, job.company),
  };
}

/**
 * Removes duplicates within one run: first by canonical URL, then by title+company.
 * The first occurrence wins, so order sources by preference before calling.
 */
export function dedupeWithinRun(jobs: DiscoveredJob[]): KeyedJob[] {
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  const unique: KeyedJob[] = [];

  for (const job of jobs.map(withKeys)) {
    if (seenUrls.has(job.canonicalUrl) || seenKeys.has(job.dedupeKey)) continue;
    seenUrls.add(job.canonicalUrl);
    seenKeys.add(job.dedupeKey);
    unique.push(job);
  }
  return unique;
}

/** Drops jobs whose canonical URL or title+company key is already in the database. */
export function excludeExisting(
  jobs: KeyedJob[],
  existing: { canonicalUrls: Set<string>; dedupeKeys: Set<string> },
): KeyedJob[] {
  return jobs.filter(
    (job) => !existing.canonicalUrls.has(job.canonicalUrl) && !existing.dedupeKeys.has(job.dedupeKey),
  );
}
