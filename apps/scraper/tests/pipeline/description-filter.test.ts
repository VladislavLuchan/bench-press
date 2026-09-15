import { describe, expect, it } from 'vitest';
import { descriptionVerdict } from '../../src/pipeline/prefilter.ts';

const eu = { source: 'linkedin', title: 'Frontend Engineer', location: 'Poland', company: 'Acme' };
const ua = { source: 'djinni', title: 'Frontend Engineer', location: 'Ukraine', company: 'Acme' };
const long = 'x'.repeat(400);

describe('descriptionVerdict', () => {
  it('flags thin descriptions but does not reject them', () => {
    expect(descriptionVerdict(eu, 'React developer wanted.')).toEqual({
      reason: null,
      match: null,
      thin: true,
      locationFlag: 'none',
    });
  });

  it('rejects an explicit salary below the regional floor', () => {
    expect(descriptionVerdict(eu, `${long} Salary: $3000-3500 per month.`).reason).toMatch(/4000/);
    expect(descriptionVerdict(ua, `${long} Salary: $3000-3400 per month.`).reason).toMatch(/3500/);
    expect(descriptionVerdict(ua, `${long} Salary: $3500-4500 per month.`).reason).toBeNull();
  });

  it('ignores numbers that are not salaries', () => {
    expect(
      descriptionVerdict(eu, `${long} 5+ years, 2020, team of 12, budget 1500 users`).reason,
    ).toBeNull();
  });

  it('rejects office-based jobs without any remote option and keeps the phrase', () => {
    const verdict = descriptionVerdict(eu, `${long} This is an office-based position in Warsaw.`);
    expect(verdict.reason).toBe('on-site');
    expect(verdict.match).toBe('office-based');
    expect(
      descriptionVerdict(eu, `${long} Office-based, or fully remote if you prefer.`).reason,
    ).toBeNull();
  });

  it('flags hub wording as soft instead of rejecting it (the Wolt case)', () => {
    const verdict = descriptionVerdict(
      eu,
      `${long} This role can be based in our tech hub in Tallinn or Helsinki.`,
    );
    expect(verdict.reason).toBeNull();
    expect(verdict.locationFlag).toBe('soft');
    expect(verdict.match).toBe('can be based in');
  });

  it('also reads the listing location field', () => {
    expect(descriptionVerdict({ ...eu, location: 'Warsaw (on-site only)' }, long).reason).toBe(
      'on-site',
    );
  });
});
