import * as cheerio from 'cheerio';
import { htmlToText, normalizeWhitespace } from '../lib/html-to-text.ts';
import { linkedinJobId } from '../lib/normalize-url.ts';
import { parseDate } from '../lib/parse-date.ts';
import { config } from '../config.ts';
import type { DiscoveredJob, Source } from './types.ts';

const GUEST_POSTING_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';

/**
 * LinkedIn guest job search. Both endpoints are public and unauthenticated; we never send
 * cookies. A 429, a redirect to the auth wall, or an empty result page means "blocked":
 * the pipeline backs off for hours instead of retrying.
 */
export const linkedin: Source = {
  name: 'linkedin',
  listingUrls: config.sources.linkedin.listingUrls,
  emptyMeansBlocked: true,

  parseListings(body) {
    const $ = cheerio.load(body);
    const jobs: DiscoveredJob[] = [];

    $('div.base-card').each((_, element) => {
      const card = $(element);
      const href = card.find('a.base-card__full-link').attr('href');
      const title = normalizeWhitespace(card.find('h3.base-search-card__title').text());
      if (!href || !title) return;

      const urn = card.attr('data-entity-urn') ?? '';
      const externalId = urn.split(':').pop() || linkedinJobId(new URL(href).pathname);
      const location = normalizeWhitespace(card.find('.job-search-card__location').text());

      jobs.push({
        source: 'linkedin',
        externalId: externalId || null,
        url: href,
        title,
        company: normalizeWhitespace(card.find('h4.base-search-card__subtitle').text()) || null,
        location: location || null,
        salaryRaw: normalizeWhitespace(card.find('.job-search-card__salary-info').text()) || null,
        postedAt: parseDate(card.find('time').attr('datetime')),
        // Search was filtered by f_WT=2 (remote), but only trust explicit text.
        remote: /remote/i.test(location) ? true : null,
        description: null,
      });
    });

    return jobs;
  },

  descriptionUrl(listing) {
    const id = listing.externalId ?? linkedinJobId(new URL(listing.url).pathname);
    return id ? `${GUEST_POSTING_URL}${id}` : null;
  },

  parseDescription(body) {
    const $ = cheerio.load(body);
    const description = htmlToText($('.show-more-less-html__markup').first().html() ?? '');
    const criteria = $('.description__job-criteria-item')
      .map((_, item) => {
        const label = normalizeWhitespace(
          $(item).find('.description__job-criteria-subheader').text(),
        );
        const value = normalizeWhitespace($(item).find('.description__job-criteria-text').text());
        return label && value ? `${label}: ${value}` : '';
      })
      .get()
      .filter(Boolean);
    const salary = normalizeWhitespace($('.compensation__salary').first().text());

    return [description, criteria.join('\n'), salary && `Salary: ${salary}`]
      .filter(Boolean)
      .join('\n\n');
  },
};
