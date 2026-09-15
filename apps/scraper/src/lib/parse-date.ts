const DAY_MS = 24 * 60 * 60 * 1000;

const RELATIVE_UNITS: Array<[RegExp, number]> = [
  [/(min|хв|minute)/i, 60 * 1000],
  [/(hour|год|hr)/i, 60 * 60 * 1000],
  [/(day|дн|день)/i, DAY_MS],
  [/(week|тиж)/i, 7 * DAY_MS],
  [/(month|міс)/i, 30 * DAY_MS],
];

/**
 * Turns the date formats seen on job boards into ISO 8601: absolute dates (ISO, RFC 2822),
 * and relative phrases in English and Ukrainian ("2 days ago", "3 години тому", "вчора").
 * Returns null when the text cannot be interpreted.
 */
export function parseDate(text: string | null | undefined, now: Date = new Date()): string | null {
  if (!text) return null;
  const value = text.trim();
  if (!value) return null;

  if (/^(today|сьогодні|just now|щойно)$/i.test(value)) return now.toISOString();
  if (/^(yesterday|вчора)$/i.test(value)) return new Date(now.getTime() - DAY_MS).toISOString();

  const relative = value.match(/(\d+)\s*(\p{L}+)/u);
  if (relative && /(ago|тому)/i.test(value)) {
    const [, amount = '0', unitText = ''] = relative;
    const unit = RELATIVE_UNITS.find(([pattern]) => pattern.test(unitText));
    if (unit) return new Date(now.getTime() - Number(amount) * unit[1]).toISOString();
  }

  // Djinni tooltips: "11:49 15.09.2026". Treated as UTC; day-level accuracy is enough.
  const dotted = value.match(/^(?:(\d{2}):(\d{2})\s+)?(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    const [, hh = '00', mm = '00', day, month, year] = dotted;
    return new Date(`${year}-${month}-${day}T${hh}:${mm}:00.000Z`).toISOString();
  }

  const absolute = new Date(value);
  return Number.isNaN(absolute.getTime()) ? null : absolute.toISOString();
}
