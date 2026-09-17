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
      /**
       * Valid primary_keyword values, checked on the site: JavaScript, React.js, Fullstack,
       * Node.js. Unknown values silently return every job. No exp_level filter: it matches
       * the exact number of years, so "3y + 5y" drops 4, 6 and 7 year roles. Experience is
       * read from the card and filtered in code instead.
       */
      searches: [
        { keyword: 'JavaScript', maxPages: 5 },
        { keyword: 'React.js', maxPages: 3 },
        { keyword: 'Fullstack', maxPages: 2 },
      ],
      params: 'employment=remote',
      pageSize: 15,
    },
    linkedin: {
      /**
       * Guest search endpoint: no cookies, no session. Each keyword x location is one search.
       * Two pools keep the intake mostly front-end: the fullstack pool is small on purpose.
       */
      pools: [
        {
          name: 'frontend',
          keywords: [
            'senior frontend engineer',
            'senior frontend developer',
            'frontend engineer react',
            'react typescript',
            'react developer',
            'frontend lead',
            'react electron',
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
        },
        {
          name: 'fullstack',
          keywords: ['fullstack react node', 'full-stack typescript'],
          locations: ['Ukraine', 'European Union'],
        },
      ],
      maxPages: 3,
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
    /** Boards where roles stay open for weeks and the card shows the first publish date. */
    maxAgeDaysBySource: { djinni: 30 } as Partial<Record<string, number>>,
    /** Roles asking for fewer years than this are junior/middle in practice. */
    minExperienceYears: 3,
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
    perRunLimit: 100,
  },

  scoring: {
    /** Jobs per request; a bad batch answer falls back to one request per job. */
    batchSize: 5,
    /** Batches in flight at once. */
    concurrency: 6,
    perRunLimit: 100,
    /** Output budget: the JSON verdict per job, plus room for a reasoning model to think. */
    maxTokensPerJob: 900,
    reasoningHeadroomTokens: 4000,
    /** Any OpenAI-compatible endpoint; the key comes from LLM_API_KEY. */
    baseUrl: 'https://openrouter.ai/api/v1',
    /**
     * `deepseek/deepseek-chat` is an alias for the 2024 V3. V4.1 Flash is the current
     * generation and cheaper; `deepseek/deepseek-v4-pro-0813` is the stronger, pricier option.
     */
    model: 'deepseek/deepseek-v4.1-flash',
    maxRetries: 1,
    /** OpenRouter list price for the model above, used only for the cost estimate in logs. */
    usdPerMillionTokens: { input: 0.15, output: 0.6 },
  },

  notify: {
    minFit: 7,
  },

  rescore: {
    /** Open jobs re-evaluated per rescore run, newest first. */
    limit: 1000,
  },
} as const;

export type Config = typeof config;
