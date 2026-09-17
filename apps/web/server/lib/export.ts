import type { Job, JobEvent } from '@bench-press/shared';

export type ExportJob = Job & { events: JobEvent[] };

export interface ExportMeta {
  scope: 'jobs' | 'pipeline';
  exportedAt: string;
  /** Human-readable filters that produced the list, e.g. `minFit=6`. */
  filters: string[];
  includeDescription: boolean;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function day(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function fitText(job: Job): string {
  if (job.fit === null) return 'not scored yet';
  if (job.fitRaw === null || job.fitRaw === job.fit) return `${job.fit}/10`;
  const why = job.fitNotes.length > 0 ? `; ${job.fitNotes.join('; ')}` : '';
  return `${job.fit}/10 (model said ${job.fitRaw}${why})`;
}

function historyText(events: JobEvent[]): string | null {
  const steps = events
    .filter((event) => event.kind !== 'note')
    .map((event) => `${day(event.createdAt)} ${event.value}`);
  return steps.length > 0 ? steps.join(' → ') : null;
}

function listText(items: string[]): string | null {
  return items.length > 0 ? items.map(oneLine).join('; ') : null;
}

function jobToMarkdown(job: ExportJob, index: number, meta: ExportMeta): string {
  const lines = [`## ${index}. ${oneLine(job.title)} — ${job.company ?? 'unknown company'}`];
  const facts: Array<[string, string | null]> = [
    ['fit', fitText(job)],
    ['location', [job.locationType, job.location].filter(Boolean).join(', ') || null],
    ['stack', job.primaryStack],
    ['seniority', job.seniority],
    ['salary', job.salaryRaw ?? job.salaryLlm],
    ['status', job.stage ? `${job.status}, stage ${job.stage}` : job.status],
    [
      'filtered',
      job.filterReason
        ? `${job.filterReason}${job.filterMatch ? ` (matched "${job.filterMatch}")` : ''}`
        : null,
    ],
    ['sources', job.sources.join(', ')],
    ['posted', day(job.postedAt ?? job.firstSeenAt)],
    ['history', historyText(job.events)],
    ['url', job.canonicalUrl],
    ['summary', job.summary ? oneLine(job.summary) : null],
    ['matches', listText(job.matches)],
    ['gaps', listText(job.gaps)],
    ['red flags', listText(job.redFlags)],
    ['notes', job.notes ? oneLine(job.notes) : null],
  ];
  for (const [label, value] of facts) {
    if (value) lines.push(`- ${label}: ${value}`);
  }
  if (meta.includeDescription && job.description) {
    lines.push('', '### Description', '', job.description.trim());
  }
  if (meta.scope === 'pipeline' && job.coverLetter) {
    lines.push('', '### Cover letter', '', job.coverLetter.trim());
  }
  return lines.join('\n');
}

/**
 * Compact Markdown meant to be pasted into an LLM: one section per job, facts as short
 * bullets, empty fields omitted, long text only when asked for.
 */
export function formatMarkdown(jobs: ExportJob[], meta: ExportMeta): string {
  const header = [
    `# bench-press export: ${meta.scope}`,
    `Exported ${meta.exportedAt} · ${jobs.length} job${jobs.length === 1 ? '' : 's'}` +
      (meta.filters.length > 0 ? ` · filters: ${meta.filters.join(', ')}` : ''),
    'Legend: fit is 1-10 after code post-validation, "model said" is the raw LLM score. ' +
      'Location types: remote, remote_region_limited, hybrid, onsite, unclear. ' +
      'Pipeline stages: replied, rejected, advancing, hr_interview, tech_interview, offer.',
  ];
  const body = jobs.map((job, index) => jobToMarkdown(job, index + 1, meta));
  return [...header, ...body].join('\n\n') + '\n';
}

/** One JSON object per line with stable, documented field names. */
export function formatJsonl(jobs: ExportJob[], meta: ExportMeta): string {
  return (
    jobs
      .map((job) =>
        JSON.stringify({
          id: job.id,
          title: job.title,
          company: job.company,
          url: job.canonicalUrl,
          sources: job.sources,
          location: job.location,
          locationType: job.locationType,
          salary: job.salaryRaw ?? job.salaryLlm,
          fit: job.fit,
          fitRaw: job.fitRaw,
          fitNotes: job.fitNotes,
          primaryStack: job.primaryStack,
          seniority: job.seniority,
          summary: job.summary,
          matches: job.matches,
          gaps: job.gaps,
          redFlags: job.redFlags,
          status: job.status,
          stage: job.stage,
          filterReason: job.filterReason,
          filterMatch: job.filterMatch,
          postedAt: job.postedAt,
          firstSeenAt: job.firstSeenAt,
          appliedAt: job.appliedAt,
          repliedAt: job.repliedAt,
          notes: job.notes,
          history: job.events.map((event) => ({
            at: event.createdAt,
            kind: event.kind,
            value: event.value,
          })),
          ...(meta.includeDescription ? { description: job.description } : {}),
          ...(meta.scope === 'pipeline' ? { coverLetter: job.coverLetter } : {}),
        }),
      )
      .join('\n') + (jobs.length > 0 ? '\n' : '')
  );
}
