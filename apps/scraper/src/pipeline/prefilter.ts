import { config } from '../config.ts';
import { parseSalary, salaryMaxInUsd } from '../lib/parse-salary.ts';
import type { DiscoveredJob } from '../sources/types.ts';

export type PrefilterOptions = typeof config.prefilter;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cheap, deterministic checks that run before any LLM call. Returns the reason a job is
 * skipped, or null when it should go on to scoring. Unknown data never disqualifies:
 * a missing salary or location passes through and the LLM sees it.
 */
export function prefilterReason(
  job: DiscoveredJob,
  options: PrefilterOptions = config.prefilter,
  now: Date = new Date(),
): string | null {
  const title = job.title.toLowerCase();
  const keyword = options.excludeTitleKeywords.find((word) => title.includes(word));
  if (keyword) return `title contains "${keyword}"`;
  if (!options.requireTitleKeywords.some((word) => title.includes(word))) {
    return 'title is not a front-end role';
  }

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
