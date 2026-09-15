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
      /** Valid primary_keyword values checked on the site: JavaScript, Fullstack, Node.js. */
      keywords: ['JavaScript', 'Fullstack'],
      params: 'exp_level=3y&exp_level=5y&employment=remote',
      maxPages: 5,
      pageSize: 15,
    },
    linkedin: {
      /** Guest search endpoint: no cookies, no session. Each query x location is one search. */
      keywords: [
        'react typescript',
        'react electron',
        'senior frontend engineer',
        'frontend engineer react',
        'fullstack react node',
        'product engineer react',
      ],
      locations: [
        'Ukraine',
        'European Union',
        'Poland',
        'Norway',
        'Sweden',
        'Denmark',
        'Netherlands',
        'Germany',
      ],
      maxPages: 4,
      pageSize: 10,
    },
    dou: {
      /** Feed category names checked on the site. */
      categories: ['Front End', 'Full Stack'],
    },
    nofluffjobs: {
      /** rawSearch strings of the public search API; region pl is where remote EU offers live. */
      searches: ['category=frontend city=remote', 'category=fullstack city=remote'],
      region: 'pl',
    },
  },

  /** How long a source stays disabled after a block signal (429, login redirect, empty page). */
  sourceBackoffHours: 12,

  prefilter: {
    /** Title rules live in config/filters.ts. */
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
    perRunLimit: 60,
  },

  scoring: {
    /** Jobs per request; a bad batch answer falls back to one request per job. */
    batchSize: 5,
    /** Batches in flight at once. */
    concurrency: 2,
    perRunLimit: 60,
    /** Any OpenAI-compatible endpoint; the key comes from LLM_API_KEY. */
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat',
    maxRetries: 1,
    /** OpenRouter list price for the model above, used only for the cost estimate in logs. */
    usdPerMillionTokens: { input: 0.27, output: 1.1 },
  },

  notify: {
    minFit: 7,
  },
} as const;

export type Config = typeof config;
