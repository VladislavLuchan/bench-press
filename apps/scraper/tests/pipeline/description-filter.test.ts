import { describe, expect, it } from 'vitest';
import { descriptionVerdict } from '../../src/pipeline/prefilter.ts';

const eu = { source: 'linkedin', location: 'Poland', company: 'Acme' };
const ua = { source: 'djinni', location: 'Ukraine', company: 'Acme' };
const long = 'x'.repeat(400);

describe('descriptionVerdict', () => {
  it('flags thin descriptions but does not reject them', () => {
    expect(descriptionVerdict(eu, 'React developer wanted.')).toEqual({ reason: null, thin: true });
  });

  it('rejects an explicit salary below the regional floor', () => {
    expect(descriptionVerdict(eu, `${long} Salary: $3000-3500 per month.`).reason).toMatch(/4000/);
    expect(descriptionVerdict(ua, `${long} Salary: $3000-3400 per month.`).reason).toMatch(/3500/);
    expect(descriptionVerdict(ua, `${long} Salary: $3500-4500 per month.`).reason).toBeNull();
  });

  it('ignores numbers that are not salaries', () => {
    expect(descriptionVerdict(eu, `${long} 5+ years, 2020, team of 12, budget 1500 users`).reason).toBeNull();
  });

  it('rejects office-only jobs without any remote option', () => {
    expect(descriptionVerdict(eu, `${long} This is an office only position in Warsaw.`).reason).toMatch(/office/);
    expect(descriptionVerdict(eu, `${long} Office only for the first month, then remote.`).reason).toBeNull();
  });
});
