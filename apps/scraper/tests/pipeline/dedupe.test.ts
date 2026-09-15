import { describe, expect, it } from 'vitest';
import type { ExistingJobRef } from '@bench-press/shared';
import { dedupeWithinRun, excludeExisting, withKeys } from '../../src/pipeline/dedupe.ts';
import type { DiscoveredJob } from '../../src/sources/types.ts';

function job(overrides: Partial<DiscoveredJob>): DiscoveredJob {
  return {
    source: 'djinni',
    externalId: null,
    url: 'https://djinni.co/jobs/1-frontend',
    title: 'Frontend Developer',
    company: 'Acme',
    location: 'Remote',
    salaryRaw: null,
    postedAt: null,
    remote: true,
    description: null,
    ...overrides,
  };
}

describe('dedupeWithinRun', () => {
  it('keeps the first of two listings with the same canonical URL', () => {
    const a = job({ url: 'https://djinni.co/jobs/1-frontend/?utm_source=a' });
    const b = job({ url: 'https://djinni.co/jobs/1-frontend', title: 'Other title' });
    expect(dedupeWithinRun([a, b]).map((item) => item.title)).toEqual(['Frontend Developer']);
  });

  it('collapses the same title and company across sources and records both sources', () => {
    const djinni = job({});
    const linkedin = job({
      source: 'linkedin',
      url: 'https://www.linkedin.com/jobs/view/4123456789',
      title: 'Frontend developer',
      company: 'ACME',
    });
    const unique = dedupeWithinRun([djinni, linkedin]);
    expect(unique).toHaveLength(1);
    expect(unique[0]?.sources).toEqual(['djinni', 'linkedin']);
  });

  it('keeps different jobs', () => {
    const a = job({});
    const b = job({ url: 'https://djinni.co/jobs/2-react', title: 'React Developer' });
    expect(dedupeWithinRun([a, b])).toHaveLength(2);
  });
});

describe('excludeExisting', () => {
  it('drops known jobs and reports new sources for them', () => {
    const known = withKeys(job({}));
    const fresh = withKeys(job({ url: 'https://djinni.co/jobs/3-vue', title: 'Vue Developer' }));
    const sameOpening = withKeys(
      job({ source: 'dou', url: 'https://jobs.dou.ua/x/4', title: 'Frontend Developer' }),
    );
    const result = excludeExisting([known, fresh, sameOpening], {
      canonicalUrls: new Map<string, ExistingJobRef>([
        [known.canonicalUrl, { id: 7, sources: ['djinni'] }],
      ]),
      dedupeKeys: new Map<string, ExistingJobRef>([
        [known.dedupeKey, { id: 7, sources: ['djinni'] }],
      ]),
    });
    expect(result.fresh).toEqual([fresh]);
    expect(result.sourceUpdates).toEqual([{ id: 7, sources: ['djinni', 'dou'] }]);
  });
});
