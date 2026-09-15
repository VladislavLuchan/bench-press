import { config } from '../config.ts';
import { checkTitle, DESCRIPTION_FILTERS } from '../config/filters.ts';
import { parseSalary, salaryMaxInUsd } from '../lib/parse-salary.ts';
import type { DiscoveredJob } from '../sources/types.ts';

export type PrefilterOptions = typeof config.prefilter;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cheap, deterministic checks that run on the listing, before descriptions or LLM calls.
 * Returns the reason a job is skipped, or null. Unknown data never disqualifies.
 */
export function prefilterReason(
  job: DiscoveredJob,
  options: PrefilterOptions = config.prefilter,
  now: Date = new Date(),
): string | null {
  const title = checkTitle(job.title);
  if (!title.ok) return title.reason;

  if (job.postedAt) {
    const ageDays = (now.getTime() - new Date(job.postedAt).getTime()) / DAY_MS;
    if (ageDays > options.maxAgeDays) return `older than ${options.maxAgeDays} days`;
  }

  const salary = parseSalary(job.salaryRaw);
  if (salary && salaryMaxInUsd(salary) < options.salaryFloorUsd) {
    return `salary below ${options.salaryFloorUsd} USD`;
  }

  if (job.remote !== true && job.location) {
    const location = job.location.toLowerCase();
    if (!options.locationKeywords.some((word) => location.includes(word))) {
      return 'not remote and not in Ukraine';
    }
  }

  return null;
}

export interface DescriptionVerdict {
  reason: string | null;
  thin: boolean;
}

/** Salary regex kept narrow: a currency sign or code must sit next to the number. */
const SALARY_IN_TEXT = /(?:[$€]\s?\d[\d\s,.]*k?(?:\s?[-–]\s?[$€]?\s?\d[\d\s,.]*k?)?|\d[\d\s,.]*k?\s?(?:USD|EUR|usd|eur|\$|€))/g;

/**
 * Checks that need the full description. Runs after the description is fetched and
 * before scoring, so the LLM never sees jobs that fail on facts stated in the text.
 */
export function descriptionVerdict(
  job: { source: string; location: string | null; company: string | null },
  description: string,
  filters = DESCRIPTION_FILTERS,
): DescriptionVerdict {
  const thin = description.length < filters.thinDescriptionChars;

  const isUkrainian =
    job.source === 'dou' ||
    job.source === 'djinni' ||
    filters.ukraineSignal.test(`${job.location ?? ''} ${job.company ?? ''}`);
  const floor = isUkrainian ? filters.salaryFloorUsd.ua : filters.salaryFloorUsd.eu;

  const mentions = description.match(SALARY_IN_TEXT) ?? [];
  const salaries = mentions.map((mention) => parseSalary(mention)).filter((s) => s !== null);
  if (salaries.length > 0) {
    const best = Math.max(...salaries.map(salaryMaxInUsd));
    if (best < floor) return { reason: `description: salary below ${floor} USD`, thin };
  }

  if (filters.officeOnly.test(description) && !filters.remoteMention.test(description)) {
    return { reason: 'description: office only', thin };
  }

  return { reason: null, thin };
}
