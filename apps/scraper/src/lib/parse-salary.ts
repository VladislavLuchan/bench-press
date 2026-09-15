export interface Salary {
  min: number;
  max: number;
  currency: 'USD' | 'EUR' | 'UAH' | 'PLN' | 'GBP' | 'unknown';
}

const CURRENCY_PATTERNS: Array<[Salary['currency'], RegExp]> = [
  ['USD', /\$|usd|дол/i],
  ['EUR', /€|eur|євро/i],
  ['UAH', /₴|uah|грн|гривн/i],
  ['PLN', /pln|zł|злот/i],
  ['GBP', /£|gbp/i],
];

/** Rough conversion so a salary floor in USD can be applied to other currencies. */
const TO_USD: Record<Salary['currency'], number> = {
  USD: 1,
  EUR: 1.08,
  UAH: 1 / 41,
  PLN: 0.25,
  GBP: 1.27,
  unknown: 1,
};

/**
 * Pulls a salary range out of free text such as "$3000-5000", "від 4 000 USD", "3.5k-5k €".
 * Returns null when no plausible monthly figure is found.
 */
export function parseSalary(text: string | null | undefined): Salary | null {
  if (!text) return null;
  const currency = CURRENCY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'unknown';

  const amounts = [...text.matchAll(/(\d[\d\s.,]*)\s*(k|к)?/gi)]
    .map((match) => toAmount(match[1] ?? '', Boolean(match[2])))
    .filter((amount): amount is number => amount !== null && amount >= 100 && amount <= 1_000_000);

  if (amounts.length === 0) return null;
  return { min: Math.min(...amounts), max: Math.max(...amounts), currency };
}

export function salaryMaxInUsd(salary: Salary): number {
  return salary.max * TO_USD[salary.currency];
}

function toAmount(raw: string, thousands: boolean): number | null {
  // "3 000" and "3,000" are thousands separators; "3.5" next to a "k" is a decimal.
  const cleaned = thousands ? raw.replace(/[\s,]/g, '') : raw.replace(/[\s,.]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return thousands ? value * 1000 : value;
}
