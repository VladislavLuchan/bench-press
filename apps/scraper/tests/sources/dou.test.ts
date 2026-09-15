import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dou, splitTitle } from '../../src/sources/dou.ts';

const FEED_URL = 'https://jobs.dou.ua/vacancies/feeds/?category=Front%20End';
const xml = readFileSync(new URL('../fixtures/dou-list.xml', import.meta.url), 'utf8');

describe('splitTitle', () => {
  it('splits position, company and locations', () => {
    expect(splitTitle('Senior Front-end Developer в SoftServe, Київ, віддалено')).toEqual({
      title: 'Senior Front-end Developer',
      company: 'SoftServe',
      location: 'Київ, віддалено',
      salary: null,
    });
  });

  it('pulls a salary out of the tail', () => {
    expect(splitTitle('Senior Frontend Engineer (Vue.js) в Orange Uni, $2000–2500, віддалено')).toEqual({
      title: 'Senior Frontend Engineer (Vue.js)',
      company: 'Orange Uni',
      location: 'віддалено',
      salary: '$2000–2500',
    });
  });

  it('handles a company without locations', () => {
    expect(splitTitle('React Developer в Acme')).toEqual({
      title: 'React Developer',
      company: 'Acme',
      location: null,
      salary: null,
    });
  });

  it('returns the raw title when the pattern does not match', () => {
    expect(splitTitle('Frontend Developer')).toMatchObject({ title: 'Frontend Developer', company: null });
  });
});

describe('dou.parseListings', () => {
  const jobs = dou.parseListings(xml, FEED_URL);

  it('reads every item in the feed', () => {
    expect(jobs).toHaveLength(25);
  });

  it('extracts the first item with its inline description', () => {
    expect(jobs[0]).toMatchObject({
      source: 'dou',
      externalId: '373180',
      url: 'https://jobs.dou.ua/companies/intelligent-legal-solutions/vacancies/373180/?utm_source=jobsrss',
      title: 'Senior Front-End Developer',
      company: 'Intelligent Legal Solutions',
      location: 'віддалено',
      remote: true,
    });
    expect(jobs[0]?.description).toContain('Intelligent Legal Solutions');
    expect(jobs[0]?.description).not.toContain('<p>');
    expect(jobs[0]?.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps salaries that DOU puts into the title', () => {
    expect(jobs.some((job) => job.salaryRaw?.startsWith('$'))).toBe(true);
  });

  it('needs no detail page', () => {
    expect(dou.descriptionUrl(jobs[0]!)).toBeNull();
  });
});
