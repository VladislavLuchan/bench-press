import type { JobListing } from '@bench-press/shared';
import { BlockedError, type HttpClient, type HttpPage } from '../lib/http.ts';
import { log } from '../lib/logger.ts';
import type { DiscoveredJob, FetchOptions, Source } from './types.ts';

export interface FetchResult {
  jobs: DiscoveredJob[];
  /** Set when the board started refusing mid-way; collected jobs are still returned. */
  blocked: BlockedError | null;
  requests: number;
}

/** Runs every search of a source, page by page, stopping a search on a short page. */
export async function fetchListings(
  source: Source,
  http: HttpClient,
  options: FetchOptions,
): Promise<FetchResult> {
  const jobs: DiscoveredJob[] = [];
  let requests = 0;

  for (const search of source.searches(options)) {
    for (let page = 0; page < search.maxPages; page++) {
      const { url, init } = search.request(page);
      let fetched: HttpPage;
      try {
        fetched = await http.fetchPage(url, init);
        requests++;
      } catch (error) {
        if (error instanceof BlockedError) return { jobs, blocked: error, requests };
        throw error;
      }
      // Boards answer a page past the end with a redirect to an unfiltered list; that is
      // the end of this search, not more results.
      const redirected = page > 0 && new URL(fetched.finalUrl).search !== new URL(url).search;
      const pageJobs = redirected ? [] : source.parseListings(fetched.body, url);
      jobs.push(...pageJobs);
      log.info(`${source.name}: ${search.name} page ${page + 1}`, {
        status: fetched.status,
        bytes: fetched.body.length,
        items: pageJobs.length,
        redirected,
      });
      if (redirected || pageJobs.length < search.pageSize) break;
    }
  }

  if (jobs.length === 0 && source.emptyMeansBlocked && requests > 0) {
    const first = source.searches(options)[0]?.request(0).url ?? '';
    return { jobs, blocked: new BlockedError('All searches returned no jobs', first), requests };
  }
  return { jobs, blocked: null, requests };
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
