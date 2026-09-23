import { useEffect, useState } from 'react';
import { JOB_STAGES, type JobStage, type JobStatus } from '@bench-press/shared/types';
import { api, errorMessage, JOBS_CHANGED_EVENT, type JobWithEvents } from '../api/client.ts';
import { formatDateTime } from '../lib/format.ts';
import { openListing } from '../lib/pending-apply.ts';
import { toastError } from '../lib/toast.ts';
import { CoverLetterPanel } from './CoverLetterPanel.tsx';
import { FitBadge } from './FitBadge.tsx';
import { JobDescription } from './JobDescription.tsx';
import { LocationBadge } from './LocationBadge.tsx';
import { CompanyBadge, DreamBadge, RoleBadge } from './TypeBadges.tsx';

interface Props {
  job: JobWithEvents;
  onJobChange: (job: JobWithEvents) => void;
  /** Status changes go through the page, which moves on to the next job. */
  onStatus: (status: JobStatus) => void;
}

const STATUS_ACTIONS: Array<{ status: JobStatus; label: string; key: string }> = [
  { status: 'applied', label: 'Applied', key: 'a' },
  { status: 'skipped', label: 'Skip', key: 's' },
  { status: 'replied', label: 'Replied', key: 'r' },
  { status: 'new', label: 'Reset to new', key: 'n' },
];

export const STAGE_LABELS: Record<JobStage, string> = {
  replied: 'Replied',
  rejected: 'Rejected',
  advancing: 'Advancing',
  hr_interview: 'HR interview',
  tech_interview: 'Tech interview',
  offer: 'Offer',
};

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

export function JobDetail({ job, onJobChange, onStatus }: Props) {
  const [notes, setNotes] = useState(job.notes ?? '');
  useEffect(() => setNotes(job.notes ?? ''), [job.id, job.notes]);

  const update = async (body: Parameters<typeof api.jobs.update>[1]) => {
    try {
      onJobChange(await api.jobs.update(job.id, body));
      window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
    } catch (err) {
      toastError(`Could not save: ${errorMessage(err)}`);
    }
  };

  const facts = [
    job.company ?? 'unknown company',
    job.location,
    job.salaryRaw ?? job.salaryLlm,
    job.seniority,
    job.primaryStack,
  ].filter(Boolean);

  return (
    <div className="job-detail">
      <div className="job-detail__top">
        <header className="job-detail__header">
          <FitBadge fit={job.fit} fitRaw={job.fitRaw} notes={job.fitNotes} />
          <div className="job-detail__heading">
            <h2 className="job-detail__title">
              <a
                href={job.url}
                title="Open the listing in a new window"
                onClick={(event) => {
                  event.preventDefault();
                  openListing(job);
                }}
              >
                {job.title}
              </a>
            </h2>
            <p className="job-detail__meta">
              <DreamBadge dream={job.dream} /> <RoleBadge type={job.roleType} />{' '}
              <LocationBadge type={job.locationType} /> <CompanyBadge type={job.companyType} />{' '}
              <button
                type="button"
                className="link-button"
                title="Open the listing in a new window"
                onClick={() => openListing(job)}
              >
                {job.company ?? 'unknown company'}
              </button>
              {facts.slice(1).length > 0 && ` · ${facts.slice(1).join(' · ')}`}
            </p>
            <p className="job-detail__meta job-detail__meta--muted">
              {job.sources.join(', ')} · seen {formatDateTime(job.firstSeenAt)}
              {job.appliedAt && ` · applied ${formatDateTime(job.appliedAt)}`}
              {job.repliedAt && ` · replied ${formatDateTime(job.repliedAt)}`}
              {job.filterReason && ` · filtered: ${job.filterReason}`}
              {job.filterMatch && ` (matched "${job.filterMatch}")`}
            </p>
          </div>
        </header>

        <div className="job-detail__actions">
          {STATUS_ACTIONS.map(({ status, label, key }) => (
            <button
              key={status}
              type="button"
              className={`btn ${job.status === status ? 'btn--active' : ''}`}
              disabled={job.status === status}
              title={`Shortcut: ${key}`}
              onClick={() => onStatus(status)}
            >
              {label} <kbd className="btn__key">{key}</kbd>
            </button>
          ))}
          {(job.status === 'applied' || job.status === 'replied') && (
            <label className="field field--inline">
              <span className="field__label">Stage</span>
              <select
                className="field__input"
                value={job.stage ?? ''}
                onChange={(event) =>
                  void update({ stage: (event.target.value || null) as JobStage | null })
                }
              >
                <option value="">Applied (waiting)</option>
                {JOB_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {job.summary && <p className="job-detail__summary">{job.summary}</p>}
      {job.fitNotes.length > 0 && (
        <ul className="job-detail__notes">
          {job.fitNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {job.scoreError && <p className="job-detail__error">Scoring failed: {job.scoreError}</p>}
      <div className="job-detail__lists">
        <List title="Matches" items={job.matches} tone="good" />
        <List title="Gaps" items={job.gaps} tone="warn" />
        <List title="Red flags" items={job.redFlags} tone="bad" />
      </div>

      <CoverLetterPanel
        job={job}
        onJobChange={(changed) => onJobChange({ ...changed, events: job.events })}
      />

      <section className="job-detail__section">
        <h3 className="job-detail__section-title">
          Job description
          {job.thinDescription && <span className="job-detail__tag">thin</span>}
        </h3>
        <JobDescription text={job.description} />
      </section>

      <section className="job-detail__section">
        <h3 className="job-detail__section-title">Notes</h3>
        <textarea
          className="field__input job-detail__notes-input"
          rows={3}
          placeholder="Contacts, interview dates, impressions. Saved when you leave the field."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes !== (job.notes ?? '')) void update({ notes });
          }}
        />
      </section>

      {job.events.length > 0 && (
        <section className="job-detail__section">
          <h3 className="job-detail__section-title">History</h3>
          <ul className="timeline">
            {[...job.events].reverse().map((event) => (
              <li key={event.id} className="timeline__item">
                <span className="timeline__time">{formatDateTime(event.createdAt)}</span>
                <span className={`timeline__kind timeline__kind--${event.kind}`}>{event.kind}</span>
                <span className="timeline__value">
                  {event.kind === 'stage' && event.value in STAGE_LABELS
                    ? STAGE_LABELS[event.value as JobStage]
                    : event.value}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
