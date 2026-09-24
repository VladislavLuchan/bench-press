const DAY_MS = 24 * 60 * 60 * 1000;

const KYIV_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Kyiv',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

/** How far Kyiv clocks are ahead of UTC around this instant: 2 h in winter, 3 h in summer. */
function kyivOffsetMs(instant: number): number {
  const parts = Object.fromEntries(
    KYIV_CLOCK.formatToParts(new Date(instant)).map((part) => [part.type, Number(part.value)]),
  );
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!);
  return wall - Math.floor(instant / 60_000) * 60_000;
}

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

  // Djinni tooltips: "11:49 15.09.2026", written in Kyiv time.
  const dotted = value.match(/^(?:(\d{2}):(\d{2})\s+)?(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    const [, hh = '00', mm = '00', day = '01', month = '01', year = '1970'] = dotted;
    const wall = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm));
    return new Date(wall - kyivOffsetMs(wall)).toISOString();
  }

  const absolute = new Date(value);
  return Number.isNaN(absolute.getTime()) ? null : absolute.toISOString();
}
