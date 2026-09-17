/**
 * Companies that are never scored: mass reposters and aggregators whose listings hide the
 * real employer. Matched case-insensitively against the start of the company name.
 * Jobs from them are stored as `filtered` with the reason `blacklisted company`.
 */
export const COMPANY_BLACKLIST: readonly string[] = ['Quik Hire Staffing', 'Hire Feed', 'Jobgether'];

export function isBlacklistedCompany(company: string | null): boolean {
  if (!company) return false;
  const name = company.trim().toLowerCase();
  return COMPANY_BLACKLIST.some((entry) => name.startsWith(entry.toLowerCase()));
}
