import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nofluffjobs } from '../../src/sources/nofluffjobs.ts';

const SEARCH_URL = 'https://nofluffjobs.com/api/search/posting?page=1';
const listJson = readFileSync(new URL('../fixtures/nofluffjobs-list.json', import.meta.url), 'utf8');
const detailJson = readFileSync(new URL('../fixtures/nofluffjobs-detail.json', import.meta.url), 'utf8');

describe('nofluffjobs.parseListings', () => {
  const jobs = nofluffjobs.parseListings(listJson, SEARCH_URL);

  it('reads every posting from the search response', () => {
    expect(jobs).toHaveLength(20);
  });

  it('maps the first posting with salary and remote flag', () => {
    expect(jobs[0]).toMatchObject({
      source: 'nofluffjobs',
      externalId: 'junior-angular-developer-link-group-Remote-1',
      url: 'https://nofluffjobs.com/job/junior-angular-developer-link-group-remote-1',
      title: 'Junior Angular Developer',
      company: 'Link Group',
      location: 'Remote',
      salaryRaw: '1848-3024 EUR/Month',
      remote: true,
      description: null,
    });
    expect(jobs[0]?.postedAt).toBe(new Date(1788262401316).toISOString());
  });

  it('fetches details from the posting endpoint', () => {
    expect(nofluffjobs.descriptionUrl(jobs[0]!)).toBe(
      'https://nofluffjobs.com/api/posting/junior-angular-developer-link-group-Remote-1',
    );
  });
});

describe('nofluffjobs.parseDescription', () => {
  it('assembles seniority, requirements and tasks into text', () => {
    const description = nofluffjobs.parseDescription(detailJson);
    expect(description).toContain('Seniority: Junior');
    expect(description).toContain('Must have: Angular, TypeScript');
    expect(description.length).toBeGreaterThan(300);
  });
});
