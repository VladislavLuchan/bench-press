import { useState } from 'react';
import type { Job, JobStatus } from '@bench-press/shared/types';
import { api, errorMessage, JOBS_CHANGED_EVENT } from '../api/client.ts';
import { formatDateTime } from '../lib/format.ts';
import { CoverLetterPanel } from './CoverLetterPanel.tsx';
import { FitBadge } from './FitBadge.tsx';

interface Props {
  job: Job;
  onJobChange: (job: Job) => void;
}

const STATUS_ACTIONS: Array<{ status: JobStatus; label: string }> = [
  { status: 'applied', label: 'Applied' },
  { status: 'replied', label: 'Replied' },
  { status: 'skipped', label: 'Skipped' },
  { status: 'new', label: 'Reset to new' },
];

function List({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`job-detail__list job-detail__list--${tone}`}>
      <h4 className="job-detail__list-title">{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function JobDetail({ job, onJobChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (status: JobStatus) => {
    setError(null);
    try {
      onJobChange(await api.jobs.update(job.id, { status }));
      window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="job-detail">
      <header className="job-detail__header">
        <FitBadge fit={job.fit} />
        <div>
          <h2 className="job-detail__title">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              {job.title}
            </a>
          </h2>
          <p className="job-detail__meta">
            {[job.company, job.location, job.salaryRaw ?? job.salaryLlm, job.seniority, job.primaryStack]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="job-detail__meta">
            {job.sources.join(', ')} · seen {formatDateTime(job.firstSeenAt)}
            {job.filterReason && ` · filtered: ${job.filterReason}`}
            {job.appliedAt && ` · applied ${formatDateTime(job.appliedAt)}`}
            {job.repliedAt && ` · replied ${formatDateTime(job.repliedAt)}`}
          </p>
        </div>
      </header>

      <div className="job-detail__actions">
        {STATUS_ACTIONS.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            className={`btn ${job.status === status ? 'btn--active' : ''}`}
            disabled={job.status === status}
            onClick={() => void setStatus(status)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="job-detail__error">{error}</p>}

      {job.summary && <p className="job-detail__summary">{job.summary}</p>}
      {job.scoreError && <p className="job-detail__error">Scoring failed: {job.scoreError}</p>}
      <div className="job-detail__lists">
        <List title="Matches" items={job.matches} tone="good" />
        <List title="Gaps" items={job.gaps} tone="warn" />
        <List title="Red flags" items={job.redFlags} tone="bad" />
      </div>

      <CoverLetterPanel key={job.id} job={job} onJobChange={onJobChange} />

      <details className="job-detail__description">
        <summary>Job description</summary>
        <pre className="job-detail__description-text">{job.description ?? 'Not fetched yet.'}</pre>
      </details>
    </div>
  );
}
