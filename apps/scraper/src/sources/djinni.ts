import * as cheerio from 'cheerio';
import { htmlToText, normalizeWhitespace } from '../lib/html-to-text.ts';
import { parseDate } from '../lib/parse-date.ts';
import { config } from '../config.ts';
import type { DiscoveredJob, Search, Source } from './types.ts';

const REMOTE = /remote|віддалено|дистанційно/i;

/**
 * Djinni public listing pages. No login needed. The listing card already carries the full
 * description (hidden behind "More"), so a detail fetch is only a fallback.
 * Selectors are pinned by tests on saved fixtures.
 */
export const djinni: Source = {
  name: 'djinni',

  searches() {
    const { keywords, params, maxPages, pageSize } = config.sources.djinni;
    return keywords.map((keyword): Search => ({
      name: keyword,
      maxPages,
      pageSize,
      request: (page) => ({
        url: `https://djinni.co/jobs/?primary_keyword=${encodeURIComponent(keyword)}&${params}&page=${page + 1}`,
      }),
    }));
  },

  parseListings(body, pageUrl) {
    const $ = cheerio.load(body);
    const jobs: DiscoveredJob[] = [];

    $('[id^="job-item-"]').each((_, element) => {
      const card = $(element);
      const href = card.find('a.job_item__header-link').attr('href');
      const title = normalizeWhitespace(card.find('.job-item__position').first().text());
      if (!href || !title) return;

      // "Full Remote · Countries of Europe or Ukraine · 5 years of experience · English - B2"
      const conditions = normalizeWhitespace(
        card.find('.job_item__header-link + .fw-medium').text(),
      );
      const location = normalizeWhitespace(card.find('.location-text').first().text());
      // Public salaries render as "$3000-5000"; otherwise Djinni shows a "$$$" level, which
      // carries no digits and is ignored.
      const salaryText = normalizeWhitespace(card.find('header .col-auto').last().text());
      const dateText = card.find('span[title][data-bs-toggle="tooltip"]').last().attr('title');
      const descriptionHtml = card.find('.js-original-text').first().html();

      jobs.push({
        source: 'djinni',
        externalId: card.attr('id')?.replace('job-item-', '') ?? null,
        url: new URL(href, pageUrl).toString(),
        title,
        company: normalizeWhitespace(card.find('header span.small').first().text()) || null,
        location: location || null,
        salaryRaw: /\d/.test(salaryText) ? salaryText : null,
        postedAt: parseDate(dateText),
        remote: REMOTE.test(conditions) ? true : null,
        description: descriptionHtml ? htmlToText(descriptionHtml) || null : null,
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
