import { htmlToText, normalizeWhitespace } from '../lib/html-to-text.ts';
import { config } from '../config.ts';
import type { DiscoveredJob, Search, Source } from './types.ts';

const SEARCH_URL = 'https://nofluffjobs.com/api/search/posting';
const POSTING_URL = 'https://nofluffjobs.com/api/posting/';
const JOB_PAGE_URL = 'https://nofluffjobs.com/job/';

interface SearchResponse {
  postings?: Array<{
    id?: string;
    url?: string;
    title?: string;
    name?: string;
    posted?: number;
    fullyRemote?: boolean;
    location?: { places?: Array<{ city?: string; country?: { name?: string } }> };
    salary?: { from?: number; to?: number; currency?: string; period?: string };
  }>;
}

interface PostingResponse {
  title?: string;
  requirements?: {
    description?: string;
    musts?: Array<{ value?: string }>;
    nices?: Array<{ value?: string }>;
  };
  specs?: { dailyTasks?: string[] };
  basics?: { category?: string; seniority?: string[] };
  location?: { fullyRemote?: boolean | null };
}

/**
 * No Fluff Jobs public search and posting JSON, the same endpoints the site itself calls.
 * Searches are restricted to remote offers; one page holds the whole result set.
 */
export const nofluffjobs: Source = {
  name: 'nofluffjobs',

  searches() {
    const { searches, region } = config.sources.nofluffjobs;
    return searches.map((rawSearch): Search => ({
      name: rawSearch,
      maxPages: 1,
      pageSize: Number.POSITIVE_INFINITY,
      request: () => ({
        url: `${SEARCH_URL}?page=1&salaryCurrency=EUR&salaryPeriod=month&region=${region}`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ rawSearch, page: 1 }),
        },
      }),
    }));
  },

  parseListings(body) {
    const data = JSON.parse(body) as SearchResponse;
    const jobs: DiscoveredJob[] = [];

    for (const posting of data.postings ?? []) {
      if (!posting.id || !posting.url || !posting.title) continue;
      const place = posting.location?.places?.[0];
      const salary = posting.salary;
      jobs.push({
        source: 'nofluffjobs',
        externalId: posting.id,
        url: `${JOB_PAGE_URL}${posting.url}`,
        title: normalizeWhitespace(posting.title),
        company: posting.name ? normalizeWhitespace(posting.name) : null,
        location: [place?.city, place?.country?.name].filter(Boolean).join(', ') || null,
        salaryRaw:
          salary?.from && salary.currency
            ? `${salary.from}${salary.to && salary.to !== salary.from ? `-${salary.to}` : ''} ${salary.currency}/${salary.period ?? 'month'}`
            : null,
        postedAt: posting.posted ? new Date(posting.posted).toISOString() : null,
        // Searches carry city=remote, so every result is a remote offer.
        remote: true,
        description: null,
      });
    }
    return jobs;
  },

  descriptionUrl(listing) {
    return listing.externalId ? `${POSTING_URL}${listing.externalId}` : null;
  },

  parseDescription(body) {
    const data = JSON.parse(body) as PostingResponse;
    const list = (items: Array<{ value?: string }> | undefined) =>
      (items ?? [])
        .map((item) => item.value)
        .filter(Boolean)
        .join(', ');
    const sections = [
      data.basics?.seniority?.length ? `Seniority: ${data.basics.seniority.join(', ')}` : '',
      list(data.requirements?.musts) && `Must have: ${list(data.requirements?.musts)}`,
      list(data.requirements?.nices) && `Nice to have: ${list(data.requirements?.nices)}`,
      data.requirements?.description ? htmlToText(data.requirements.description) : '',
      data.specs?.dailyTasks?.length ? `Tasks:\n- ${data.specs.dailyTasks.join('\n- ')}` : '',
    ];
    return sections.filter(Boolean).join('\n\n');
  },
};
