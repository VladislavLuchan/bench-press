import * as cheerio from 'cheerio';
import { htmlToText, normalizeWhitespace } from '../lib/html-to-text.ts';
import { parseDate } from '../lib/parse-date.ts';
import { config } from '../config.ts';
import type { DiscoveredJob, Search, Source } from './types.ts';

const REMOTE = /remote|віддалено|дистанційно/i;

/**
 * DOU official RSS feed. Items carry the full description inline, so no detail fetch.
 * Titles look like "Senior Front-end Developer в SoftServe, Київ, віддалено".
 */
export const dou: Source = {
  name: 'dou',

  searches() {
    return config.sources.dou.categories.map((category): Search => ({
      name: category,
      maxPages: 1,
      pageSize: Number.POSITIVE_INFINITY,
      request: () => ({
        url: `https://jobs.dou.ua/vacancies/feeds/?category=${encodeURIComponent(category)}`,
      }),
    }));
  },

  parseListings(body) {
    const $ = cheerio.load(body, { xml: true });
    const jobs: DiscoveredJob[] = [];

    $('item').each((_, element) => {
      const item = $(element);
      const url = normalizeWhitespace(item.find('link').text());
      const rawTitle = normalizeWhitespace(item.find('title').text());
      if (!url || !rawTitle) return;

      const { title, company, location, salary } = splitTitle(rawTitle);
      const description = htmlToText(item.find('description').text());

      jobs.push({
        source: 'dou',
        externalId: url.match(/\/vacancies\/(\d+)/)?.[1] ?? null,
        url,
        title,
        company,
        location,
        salaryRaw: salary,
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

export interface SplitTitle {
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
}

const SALARY_PART = /[$€₴]\s*\d|\d\s*[$€₴]/;

/** "Senior Frontend Engineer в Orange Uni, $2000–2500, віддалено" -> its four parts. */
export function splitTitle(rawTitle: string): SplitTitle {
  const match = rawTitle.match(/^(.+?)\s+в\s+(.+)$/u);
  if (!match) return { title: rawTitle, company: null, location: null, salary: null };

  const [, title = rawTitle, rest = ''] = match;
  const [company, ...tail] = rest.split(',').map((part) => part.trim());
  const salary = tail.find((part) => SALARY_PART.test(part)) ?? null;
  const locationParts = tail.filter((part) => part !== salary);
  return {
    title,
    company: company || null,
    location: locationParts.length > 0 ? locationParts.join(', ') : null,
    salary,
  };
}
