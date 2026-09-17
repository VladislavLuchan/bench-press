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

  it('skips roles that are not front-end at all', () => {
    expect(prefilterReason(job({ title: 'ABAP Developer' }), undefined, now)).toMatch(
      /not a front-end/,
    );
    expect(
      prefilterReason(job({ title: 'Senior Full Stack Engineer (Node + React)' }), undefined, now),
    ).toBeNull();
  });

  it('skips listings older than the limit, with a longer window for Djinni', () => {
    const posted = '2026-09-01T00:00:00.000Z';
    expect(prefilterReason(job({ source: 'linkedin', postedAt: posted }), undefined, now)).toMatch(
      /older than 7/,
    );
    expect(prefilterReason(job({ source: 'djinni', postedAt: posted }), undefined, now)).toBeNull();
    expect(
      prefilterReason(job({ source: 'djinni', postedAt: '2026-08-01T00:00:00.000Z' }), undefined, now),
    ).toMatch(/older than 30/);
    expect(
      prefilterReason(job({ source: 'linkedin', postedAt: posted }), undefined, now, false),
    ).toBeNull();
  });

  it('skips blacklisted companies before anything else', () => {
    expect(prefilterReason(job({ company: 'Quik Hire Staffing' }), undefined, now)).toBe(
      'blacklisted company',
    );
    expect(prefilterReason(job({ company: 'jobgether' }), undefined, now)).toBe('blacklisted company');
  });

  it('skips cards that ask for less than three years', () => {
    expect(prefilterReason(job({ experienceYears: 2 }), undefined, now)).toMatch(/experience below 3/);
    expect(prefilterReason(job({ experienceYears: 3 }), undefined, now)).toBeNull();
    expect(prefilterReason(job({ experienceYears: null }), undefined, now)).toBeNull();
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
