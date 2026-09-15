import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/lib/parse-date.ts';

const now = new Date('2026-09-15T12:00:00.000Z');

describe('parseDate', () => {
  it('passes ISO dates through', () => {
    expect(parseDate('2026-09-10', now)).toBe('2026-09-10T00:00:00.000Z');
  });

  it('parses RFC 2822 dates from RSS', () => {
    expect(parseDate('Mon, 14 Sep 2026 10:30:00 +0300', now)).toBe('2026-09-14T07:30:00.000Z');
  });

  it('handles English relative phrases', () => {
    expect(parseDate('2 days ago', now)).toBe('2026-09-13T12:00:00.000Z');
    expect(parseDate('3 hours ago', now)).toBe('2026-09-15T09:00:00.000Z');
  });

  it('handles Ukrainian relative phrases', () => {
    expect(parseDate('5 днів тому', now)).toBe('2026-09-10T12:00:00.000Z');
    expect(parseDate('вчора', now)).toBe('2026-09-14T12:00:00.000Z');
    expect(parseDate('сьогодні', now)).toBe(now.toISOString());
  });

  it('returns null for garbage', () => {
    expect(parseDate('soon', now)).toBeNull();
    expect(parseDate('', now)).toBeNull();
    expect(parseDate(undefined, now)).toBeNull();
  });
});
