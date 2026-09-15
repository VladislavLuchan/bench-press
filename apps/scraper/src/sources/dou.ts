import * as cheerio from 'cheerio';
import { htmlToText, normalizeWhitespace } from '../lib/html-to-text.ts';
import { parseDate } from '../lib/parse-date.ts';
import { config } from '../config.ts';
import type { DiscoveredJob, Source } from './types.ts';

const REMOTE = /remote|віддалено|дистанційно/i;

/**
 * DOU official RSS feed. Items carry the full description inline, so no detail fetch.
 * Titles look like "Senior Front-end Developer в SoftServe, Київ, віддалено".
 */
export const dou: Source = {
  name: 'dou',
  listingUrls: config.sources.dou.listingUrls,

  parseListings(body) {
    const $ = cheerio.load(body, { xml: true });
    const jobs: DiscoveredJob[] = [];

    $('item').each((_, element) => {
      const item = $(element);
      const url = normalizeWhitespace(item.find('link').text());
      const rawTitle = normalizeWhitespace(item.find('title').text());
      if (!url || !rawTitle) return;

      const { title, company, location } = splitTitle(rawTitle);
      const description = htmlToText(item.find('description').text());

      jobs.push({
        source: 'dou',
        externalId: url.match(/\/vacancies\/(\d+)/)?.[1] ?? null,
        url,
        title,
        company,
        location,
        salaryRaw: null,
        postedAt: parseDate(item.find('pubDate').text()),
        remote: REMOTE.test(location ?? '') ? true : null,
        description: description || null,
      });
    });

    return jobs;
  },

  descriptionUrl() {
    return null;
  },

  parseDescription(body) {
    return htmlToText(body);
  },
};

export function splitTitle(rawTitle: string): {
  title: string;
  company: string | null;
  location: string | null;
} {
  const match = rawTitle.match(/^(.+?)\s+в\s+(.+)$/u);
  if (!match) return { title: rawTitle, company: null, location: null };

  const [, title = rawTitle, rest = ''] = match;
  const [company, ...locationParts] = rest.split(',').map((part) => part.trim());
  return {
    title,
    company: company || null,
    location: locationParts.length > 0 ? locationParts.join(', ') : null,
  };
}
