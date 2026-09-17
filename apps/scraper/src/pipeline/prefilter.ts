import { config } from '../config.ts';
import {
  checkLocation,
  checkTitle,
  isUkrainianPlace,
  DESCRIPTION_FILTERS,
  type LocationFlag,
} from '../config/filters.ts';
import { isBlacklistedCompany } from '../config/company-blacklist.ts';
import { parseSalary, salaryMaxInUsd } from '../lib/parse-salary.ts';
import type { DiscoveredJob } from '../sources/types.ts';

export type PrefilterOptions = typeof config.prefilter;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cheap, deterministic checks that run on the listing, before descriptions or LLM calls.
 * Returns the reason a job is skipped, or null. Unknown data never disqualifies.
 */
/** The listing fields the title-level filters need; stored rows satisfy it too. */
export type PrefilterInput = Pick<
  DiscoveredJob,
  'title' | 'company' | 'source' | 'postedAt' | 'salaryRaw' | 'remote' | 'location'
> & { experienceYears?: number | null };

export function prefilterReason(
  job: PrefilterInput,
  options: PrefilterOptions = config.prefilter,
  now: Date = new Date(),
  /** Rescoring stored jobs must not punish them for having aged in the database. */
  checkAge = true,
): string | null {
  if (isBlacklistedCompany(job.company)) return 'blacklisted company';

  const title = checkTitle(job.title);
  if (!title.ok) return title.reason;

  if (checkAge && job.postedAt) {
    const maxAgeDays = options.maxAgeDaysBySource[job.source] ?? options.maxAgeDays;
    const ageDays = (now.getTime() - new Date(job.postedAt).getTime()) / DAY_MS;
    if (ageDays > maxAgeDays) return `older than ${maxAgeDays} days`;
  }

  // A low number of years on the card marks junior/middle roles, unless the title itself
  // says senior: some employers leave the field at its default.
  const lowExperience =
    typeof job.experienceYears === 'number' && job.experienceYears < options.minExperienceYears;
  if (lowExperience && !/\b(senior|lead|principal|staff)\b/i.test(job.title)) {
    return `experience below ${options.minExperienceYears} years`;
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
  /** The phrase behind `reason` when a regex produced it. */
  match: string | null;
  thin: boolean;
  /** `soft` when the text hints at an office or hub without ruling out remote work. */
  locationFlag: Exclude<LocationFlag, 'hard'>;
}

/** Salary regex kept narrow: a currency sign or code must sit next to the number. */
const SALARY_IN_TEXT =
  /(?:[$€]\s?\d[\d\s,.]*k?(?:\s?[-–]\s?[$€]?\s?\d[\d\s,.]*k?)?|\d[\d\s,.]*k?\s?(?:USD|EUR|usd|eur|\$|€))/g;

/**
 * Checks that need the full description. Runs after the description is fetched and
 * before scoring, so the LLM never sees jobs that fail on facts stated in the text.
 */
export function descriptionVerdict(
  job: { source: string; title: string; location: string | null; company: string | null },
  description: string,
  filters = DESCRIPTION_FILTERS,
): DescriptionVerdict {
  const thin = description.length < filters.thinDescriptionChars;
  const location = checkLocation([job.title, job.location ?? '', description].join('\n'));
  if (location.flag === 'hard') {
    return { reason: 'on-site', match: location.match, thin, locationFlag: 'none' };
  }
  const locationFlag = location.flag;

  const isUkrainian =
    job.source === 'dou' ||
    job.source === 'djinni' ||
    isUkrainianPlace(`${job.location ?? ''} ${job.company ?? ''}`);
  const floor = isUkrainian ? filters.salaryFloorUsd.ua : filters.salaryFloorUsd.eu;

  const mentions = description.match(SALARY_IN_TEXT) ?? [];
  const salaries = mentions.map((mention) => parseSalary(mention)).filter((s) => s !== null);
  if (salaries.length > 0) {
    const best = Math.max(...salaries.map(salaryMaxInUsd));
    if (best < floor) {
      return { reason: `description: salary below ${floor} USD`, match: null, thin, locationFlag };
    }
  }

  return { reason: null, match: location.match, thin, locationFlag };
}
