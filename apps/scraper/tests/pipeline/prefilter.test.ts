import { describe, expect, it } from 'vitest';
import { prefilterReason } from '../../src/pipeline/prefilter.ts';
import type { DiscoveredJob } from '../../src/sources/types.ts';

const now = new Date('2026-09-15T12:00:00.000Z');

function job(overrides: Partial<DiscoveredJob>): DiscoveredJob {
  return {
    source: 'djinni',
    externalId: null,
    url: 'https://djinni.co/jobs/1',
    title: 'Senior Frontend Developer',
    company: 'Acme',
    location: null,
    salaryRaw: null,
    postedAt: '2026-09-14T00:00:00.000Z',
    remote: null,
    description: null,
    ...overrides,
  };
}

describe('prefilterReason', () => {
  it('passes a plausible senior remote job', () => {
    expect(prefilterReason(job({ remote: true }), undefined, now)).toBeNull();
  });

  it('skips junior and middle titles', () => {
    expect(prefilterReason(job({ title: 'Junior React Developer' }), undefined, now)).toMatch(
      /junior/,
    );
    expect(prefilterReason(job({ title: 'Middle Frontend Dev' }), undefined, now)).toMatch(
      /middle/,
    );
  });

  it('skips listings older than the limit', () => {
    expect(prefilterReason(job({ postedAt: '2026-09-01T00:00:00.000Z' }), undefined, now)).toMatch(
      /older/,
    );
  });

  it('skips salaries clearly below the floor', () => {
    expect(prefilterReason(job({ salaryRaw: '$1000-1500' }), undefined, now)).toMatch(/salary/);
  });

  it('keeps salaries at or above the floor and unknown salaries', () => {
    expect(prefilterReason(job({ salaryRaw: '$3000-4500' }), undefined, now)).toBeNull();
    expect(prefilterReason(job({ salaryRaw: 'negotiable' }), undefined, now)).toBeNull();
  });

  it('skips on-site jobs outside Ukraine', () => {
    expect(prefilterReason(job({ location: 'Berlin, Germany' }), undefined, now)).toMatch(/remote/);
  });

  it('keeps Ukrainian and remote locations', () => {
    expect(prefilterReason(job({ location: 'Київ' }), undefined, now)).toBeNull();
    expect(prefilterReason(job({ location: 'Warsaw (Remote)' }), undefined, now)).toBeNull();
    expect(prefilterReason(job({ location: 'Berlin', remote: true }), undefined, now)).toBeNull();
  });
});
