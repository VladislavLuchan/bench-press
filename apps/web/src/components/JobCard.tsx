import type { JobSummary } from '@bench-press/shared/types';
import { formatDate } from '../lib/format.ts';
import { FitBadge } from './FitBadge.tsx';

interface Props {
  job: JobSummary;
  selected: boolean;
  onSelect: (id: number) => void;
}

export function JobCard({ job, selected, onSelect }: Props) {
  const className = ['job-card', selected && 'job-card--selected', `job-card--${job.status}`]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className} onClick={() => onSelect(job.id)}>
      <FitBadge fit={job.fit} />
      <div className="job-card__body">
        <h3 className="job-card__title">{job.title}</h3>
        <p className="job-card__meta">
          <span>{job.company ?? 'unknown company'}</span>
          <span className="job-card__source">{job.source}</span>
          {(job.salaryRaw ?? job.salaryLlm) && <span>{job.salaryRaw ?? job.salaryLlm}</span>}
          <span>{formatDate(job.postedAt ?? job.firstSeenAt)}</span>
          {job.status !== 'new' && <span className="job-card__status">{job.status}</span>}
          {job.hasCoverLetter && <span title="Cover letter ready">✉</span>}
        </p>
        {job.summary && <p className="job-card__summary">{job.summary}</p>}
      </div>
    </article>
  );
}
