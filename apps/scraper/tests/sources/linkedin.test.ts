import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { linkedin } from '../../src/sources/linkedin.ts';

const SEARCH_URL =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Frontend&location=Ukraine';
const listHtml = readFileSync(new URL('../fixtures/linkedin-list.html', import.meta.url), 'utf8');
const detailHtml = readFileSync(new URL('../fixtures/linkedin-detail.html', import.meta.url), 'utf8');

describe('linkedin.parseListings', () => {
  const jobs = linkedin.parseListings(listHtml, SEARCH_URL);

  it('finds every card in the guest search response', () => {
    expect(jobs).toHaveLength(9);
  });

  it('extracts the main fields of the first card', () => {
    expect(jobs[0]).toMatchObject({
      source: 'linkedin',
      externalId: '4465508609',
      title: 'Python Software Engineer with Frontend framework knowledge',
      company: 'Origindata',
      location: 'Ukraine',
      postedAt: '2026-09-15T00:00:00.000Z',
      description: null,
    });
    expect(jobs[0]?.url).toContain('/jobs/view/');
  });

  it('points the description fetch at the guest posting endpoint', () => {
    expect(linkedin.descriptionUrl(jobs[0]!)).toBe(
      'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4465508609',
    );
  });
});

describe('linkedin.parseDescription', () => {
  const description = linkedin.parseDescription(detailHtml);

  it('returns readable text with the job criteria appended', () => {
    expect(description).toContain('Python Developer');
    expect(description).toContain('Seniority level: Entry level');
    expect(description).toContain('Employment type: Full-time');
    expect(description).not.toContain('<p>');
  });

  it('treats an empty page as blocked at the listing level', () => {
    expect(linkedin.emptyMeansBlocked).toBe(true);
    expect(linkedin.parseListings('<html><body></body></html>', SEARCH_URL)).toEqual([]);
  });
});
