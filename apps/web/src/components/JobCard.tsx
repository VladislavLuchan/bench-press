import type { JobStatus, JobSummary } from '@bench-press/shared/types';
import { formatDate } from '../lib/format.ts';
import { FitBadge } from './FitBadge.tsx';
import { LocationBadge } from './LocationBadge.tsx';

interface Props {
  job: JobSummary;
  selected: boolean;
  onSelect: (id: number) => void;
  onQuickStatus?: (id: number, status: JobStatus) => void;
}

export function JobCard({ job, selected, onSelect, onQuickStatus }: Props) {
  const className = ['job-card', selected && 'job-card--selected', `job-card--${job.status}`]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={className}
      onClick={() => onSelect(job.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect(job.id);
      }}
      tabIndex={0}
      aria-selected={selected}
    >
      <FitBadge fit={job.fit} fitRaw={job.fitRaw} notes={job.fitNotes} />
      <div className="job-card__body">
        <h3 className="job-card__title">{job.title}</h3>
        <p className="job-card__meta">
          <span className="job-card__company">{job.company ?? 'unknown company'}</span>
          <span className="source-badge" title={job.sources.join(', ')}>
            {job.source}
            {job.sources.length > 1 && ` +${job.sources.length - 1}`}
          </span>
          <LocationBadge type={job.locationType} />
          {(job.salaryRaw ?? job.salaryLlm) && <span>{job.salaryRaw ?? job.salaryLlm}</span>}
          <span>{formatDate(job.postedAt ?? job.firstSeenAt)}</span>
          {job.status !== 'new' && <span className="job-card__status">{job.status}</span>}
          {job.hasCoverLetter && <span title="Cover letter ready">✉</span>}
        </p>
        {job.summary && <p className="job-card__summary">{job.summary}</p>}
        {job.filterReason && (
          <p className="job-card__reason">
            {job.filterReason}
            {job.filterMatch && (
              <>
                {' '}
                · matched <mark className="job-card__match">{job.filterMatch}</mark>
              </>
            )}
          </p>
        )}
        {job.thinDescription && <p className="job-card__reason">thin description</p>}
      </div>
      {onQuickStatus && job.status === 'new' && (
        <div className="job-card__actions" onClick={(event) => event.stopPropagation()}>
          <a
            className="btn btn--ghost btn--small"
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the listing"
          >
            Open
          </a>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            title="Skip without opening"
            onClick={() => onQuickStatus(job.id, 'skipped')}
          >
            Skip
          </button>
        </div>
      )}
    </article>
  );
}
