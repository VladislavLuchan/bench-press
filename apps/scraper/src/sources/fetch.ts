import type { JobListing } from '@bench-press/shared';
import { BlockedError, type HttpClient } from '../lib/http.ts';
import type { DiscoveredJob, Source } from './types.ts';

export async function fetchListings(source: Source, http: HttpClient): Promise<DiscoveredJob[]> {
  const jobs: DiscoveredJob[] = [];
  for (const url of source.listingUrls) {
    const body = await http.getText(url);
    jobs.push(...source.parseListings(body, url));
  }
  if (jobs.length === 0 && source.emptyMeansBlocked) {
    throw new BlockedError('Listing page returned no jobs', source.listingUrls[0] ?? '');
  }
  return jobs;
}

/** Full description for one listing, or null when the source has none to fetch. */
export async function fetchDescription(
  source: Source,
  listing: JobListing,
  http: HttpClient,
): Promise<string | null> {
  const url = source.descriptionUrl(listing);
  if (!url) return null;
  const body = await http.getText(url);
  return source.parseDescription(body);
}
