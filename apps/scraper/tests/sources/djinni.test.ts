import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { djinni } from '../../src/sources/djinni.ts';

const PAGE_URL = 'https://djinni.co/jobs/?primary_keyword=JavaScript';
const html = readFileSync(new URL('../fixtures/djinni-list.html', import.meta.url), 'utf8');

describe('djinni.parseListings', () => {
  const jobs = djinni.parseListings(html, PAGE_URL);

  it('finds every card on the page', () => {
    expect(jobs).toHaveLength(11);
  });

  it('extracts the main fields of the first card', () => {
    expect(jobs[0]).toMatchObject({
      source: 'djinni',
      externalId: '835688',
      url: 'https://djinni.co/jobs/835688-senior-front-end-engineer-pixi-js/',
      title: 'Senior Front-End Engineer (Pixi.js)',
      company: 'RedCore',
      location: 'EU',
      salaryRaw: null,
      remote: true,
    });
    expect(jobs[0]?.postedAt).toBe('2026-09-15T11:49:00.000Z');
  });

  it('takes the full description from the hidden block in the card', () => {
    const description = jobs[0]?.description ?? '';
    expect(description).toContain('Senior Front-End Engineer (Pixi.js)');
    expect(description).toContain('- 5+ years in frontend engineering');
    expect(description).not.toContain('<p>');
  });

  it('never leaves a card without a description', () => {
    expect(jobs.every((job) => job.description && job.description.length > 100)).toBe(true);
  });
});
