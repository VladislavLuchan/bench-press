import { describe, expect, it } from 'vitest';
import { linkedinJobId, normalizeUrl } from '../../src/lib/normalize-url.ts';

describe('normalizeUrl', () => {
  it('strips tracking parameters, fragments and trailing slashes', () => {
    expect(normalizeUrl('https://djinni.co/jobs/123-senior-frontend/?utm_source=x&ref=y#top')).toBe(
      'https://djinni.co/jobs/123-senior-frontend',
    );
  });

  it('keeps meaningful query parameters', () => {
    expect(normalizeUrl('https://example.com/jobs?id=42&utm_medium=mail')).toBe(
      'https://example.com/jobs?id=42',
    );
  });

  it('collapses LinkedIn job URLs to the numeric id', () => {
    expect(
      normalizeUrl(
        'https://ua.linkedin.com/jobs/view/senior-frontend-engineer-at-acme-4123456789?refId=abc&trackingId=def&position=1',
      ),
    ).toBe('https://www.linkedin.com/jobs/view/4123456789');
  });

  it('extracts LinkedIn ids from both slugged and bare paths', () => {
    expect(linkedinJobId('/jobs/view/4123456789/')).toBe('4123456789');
    expect(linkedinJobId('/jobs/view/frontend-dev-at-x-4123456789')).toBe('4123456789');
    expect(linkedinJobId('/jobs/search/')).toBeNull();
  });
});
