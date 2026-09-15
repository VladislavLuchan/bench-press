import * as cheerio from 'cheerio';
import { htmlToText, normalizeWhitespace } from '../lib/html-to-text.ts';
import { parseDate } from '../lib/parse-date.ts';
import { config } from '../config.ts';
import type { DiscoveredJob, Source } from './types.ts';

const REMOTE = /remote|віддалено|дистанційно/i;

/**
 * Djinni public listing pages. No login: the list and the detail page are both public.
 * Selectors follow the current markup and are pinned by tests on saved fixtures.
 */
export const djinni: Source = {
  name: 'djinni',
  listingUrls: config.sources.djinni.listingUrls,

  parseListings(body, pageUrl) {
    const $ = cheerio.load(body);
    const jobs: DiscoveredJob[] = [];

    $('li[id^="job-item-"]').each((_, element) => {
      const card = $(element);
      const link = card.find('.job-item__position a, a.job-item__title-link').first();
      const href = link.attr('href');
      const title = normalizeWhitespace(link.text());
      if (!href || !title) return;

      const location = normalizeWhitespace(
        card.find('.job-item__location, .location-text, [class*="location"]').first().text(),
      );
      const dateNode = card.find('[data-original-title], time, [title]').first();
      const dateText = dateNode.attr('datetime') ?? dateNode.attr('data-original-title') ?? dateNode.attr('title');

      jobs.push({
        source: 'djinni',
        externalId: card.attr('id')?.replace('job-item-', '') ?? null,
        url: new URL(href, pageUrl).toString(),
        title,
        company:
          normalizeWhitespace(
            card.find('a[data-analytics="company_page"], .job-item__company, [class*="company"]').first().text(),
          ) || null,
        location: location || null,
        salaryRaw: normalizeWhitespace(card.find('.public-salary-item, .text-success').first().text()) || null,
        postedAt: parseDate(dateText),
        remote: REMOTE.test(location) ? true : null,
        description: null,
      });
    });

    return jobs;
  },

  descriptionUrl(listing) {
    return listing.url;
  },

  parseDescription(body) {
    const $ = cheerio.load(body);
    const node = $('.job-post__description, .job-post-description, #job-description').first();
    return htmlToText(node.html() ?? '');
  },
};
