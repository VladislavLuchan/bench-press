import { describe, expect, it } from 'vitest';
import {
  formatJsonl,
  formatMarkdown,
  type ExportJob,
  type ExportMeta,
} from '../server/lib/export.ts';

function job(overrides: Partial<ExportJob> = {}): ExportJob {
  return {
    id: 1,
    source: 'linkedin',
    sources: ['linkedin', 'dou'],
    externalId: '1',
    url: 'https://www.linkedin.com/jobs/view/1',
    canonicalUrl: 'https://www.linkedin.com/jobs/view/1',
    dedupeKey: 'k',
    title: 'Senior Frontend Engineer',
    company: 'Fever',
    location: 'Madrid, Spain',
    salaryRaw: null,
    salaryLlm: '€70k',
    description: 'We build React apps.\n- TypeScript required',
    describeAttempts: 1,
    thinDescription: false,
    postedAt: '2026-09-14T00:00:00.000Z',
    firstSeenAt: '2026-09-14T10:00:00.000Z',
    fit: 4,
    fitRaw: 8,
    fitNotes: ['capped at 4: location is hybrid'],
    summary: 'Strong React match,\n hybrid in Madrid.',
    matches: ['React', 'TypeScript'],
    gaps: [],
    redFlags: ['location unclear'],
    remote: false,
    seniority: 'senior',
    primaryStack: 'react',
    locationType: 'hybrid',
    locationFlag: 'soft',
    scoredAt: '2026-09-14T11:00:00.000Z',
    scoreError: null,
    status: 'replied',
    stage: 'hr_interview',
    stageUpdatedAt: '2026-09-16T09:00:00.000Z',
    notes: 'Call with Ana\non Friday',
    filterReason: null,
    filterMatch: null,
    coverLetter: 'Hello Fever team.',
    coverLetterLang: 'en',
    coverLetterGeneratedAt: '2026-09-15T08:00:00.000Z',
    notifiedAt: null,
    appliedAt: '2026-09-15T08:05:00.000Z',
    repliedAt: '2026-09-16T08:00:00.000Z',
    updatedAt: '2026-09-16T09:00:00.000Z',
    events: [
      { id: 1, jobId: 1, kind: 'status', value: 'applied', createdAt: '2026-09-15T08:05:00.000Z' },
      {
        id: 2,
        jobId: 1,
        kind: 'note',
        value: 'Call with Ana',
        createdAt: '2026-09-15T09:00:00.000Z',
      },
      {
        id: 3,
        jobId: 1,
        kind: 'stage',
        value: 'hr_interview',
        createdAt: '2026-09-16T09:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const meta = (overrides: Partial<ExportMeta> = {}): ExportMeta => ({
  scope: 'jobs',
  exportedAt: '2026-09-17T10:00:00.000Z',
  filters: ['minFit=6', 'status=new'],
  includeDescription: false,
  ...overrides,
});

describe('formatMarkdown', () => {
  const text = formatMarkdown([job()], meta());

  it('starts with a header that names the scope, count and filters', () => {
    expect(text).toContain('# bench-press export: jobs');
    expect(text).toContain('1 job · filters: minFit=6, status=new');
  });

  it('writes one section per job with compact single-line facts', () => {
    expect(text).toContain('## 1. Senior Frontend Engineer — Fever');
    expect(text).toContain('- fit: 4/10 (model said 8; capped at 4: location is hybrid)');
    expect(text).toContain('- location: hybrid, Madrid, Spain');
    expect(text).toContain('- summary: Strong React match, hybrid in Madrid.');
    expect(text).toContain('- notes: Call with Ana on Friday');
    expect(text).toContain('- history: 2026-09-15 applied → 2026-09-16 hr_interview');
  });

  it('omits empty fields and long text unless asked', () => {
    expect(text).not.toContain('- gaps:');
    expect(text).not.toContain('### Description');
    expect(text).not.toContain('### Cover letter');
  });

  it('adds descriptions on request and cover letters for the pipeline', () => {
    const full = formatMarkdown([job()], meta({ scope: 'pipeline', includeDescription: true }));
    expect(full).toContain('### Description\n\nWe build React apps.');
    expect(full).toContain('### Cover letter\n\nHello Fever team.');
  });

  it('marks unscored jobs', () => {
    expect(formatMarkdown([job({ fit: null, fitRaw: null })], meta())).toContain(
      '- fit: not scored yet',
    );
  });
});

describe('formatJsonl', () => {
  it('writes one parseable object per line with the documented fields', () => {
    const lines = formatJsonl([job(), job({ id: 2 })], meta())
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(first).toMatchObject({
      id: 1,
      fit: 4,
      fitRaw: 8,
      stage: 'hr_interview',
      salary: '€70k',
    });
    expect(first.history).toHaveLength(3);
    expect(first).not.toHaveProperty('description');
    expect(first).not.toHaveProperty('coverLetter');
  });

  it('includes description and cover letter when the options call for them', () => {
    const line = formatJsonl([job()], meta({ scope: 'pipeline', includeDescription: true }));
    expect(JSON.parse(line)).toMatchObject({
      description: 'We build React apps.\n- TypeScript required',
      coverLetter: 'Hello Fever team.',
    });
  });

  it('returns an empty string for no jobs', () => {
    expect(formatJsonl([], meta())).toBe('');
  });
});
