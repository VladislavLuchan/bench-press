/**
 * Non-secret scraper configuration. Secrets live in environment variables only.
 * Tune search URLs and filters here; nothing else in the pipeline needs to change.
 */
export const config = {
  http: {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    /** Random pause between consecutive requests to the same host. */
    minDelayMs: 1000,
    maxDelayMs: 3000,
    timeoutMs: 20_000,
  },

  sources: {
    djinni: {
      listingUrls: [
        'https://djinni.co/jobs/?primary_keyword=JavaScript&exp_level=3y&exp_level=5y&employment=remote',
        'https://djinni.co/jobs/?primary_keyword=React&exp_level=3y&exp_level=5y&employment=remote',
      ],
    },
    linkedin: {
      /** Guest search endpoint: no cookies, no session. f_WT=2 remote, f_TPR=r86400 last 24h. */
      listingUrls: [
        'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Frontend%20Developer&location=Ukraine&f_WT=2&f_TPR=r86400&start=0',
        'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=React%20Developer&location=Ukraine&f_WT=2&f_TPR=r86400&start=0',
      ],
    },
    dou: {
      listingUrls: ['https://jobs.dou.ua/vacancies/feeds/?category=Front%20End'],
    },
  },

  /** How long a source stays disabled after a block signal (429, login redirect, empty page). */
  sourceBackoffHours: 12,

  prefilter: {
    /** Case-insensitive; a title containing any of these is skipped before the LLM. */
    excludeTitleKeywords: ['junior', 'middle', 'intern', 'trainee', 'student', 'джуніор', 'стажер'],
    /** Listings older than this are skipped. */
    maxAgeDays: 7,
    /** Listings whose maximum salary is clearly below this (in USD) are skipped. */
    salaryFloorUsd: 3000,
    /** Location must mention one of these, unless the listing is marked remote. */
    locationKeywords: [
      'remote',
      'ukraine',
      'україна',
      'київ',
      'kyiv',
      'львів',
      'lviv',
      'віддалено',
    ],
  },

  describe: {
    maxAttempts: 3,
    perRunLimit: 40,
  },

  scoring: {
    concurrency: 3,
    perRunLimit: 40,
    model: 'deepseek-chat',
    maxRetries: 2,
  },

  notify: {
    minFit: 7,
  },
} as const;

export type Config = typeof config;
