import { useCallback, useEffect, useState } from 'react';
import type { Job, JobSummary } from '@bench-press/shared/types';
import { api, errorMessage, type JobsQuery } from '../api/client.ts';
import { JobCard } from '../components/JobCard.tsx';
import { JobDetail } from '../components/JobDetail.tsx';
import { JobFilters } from '../components/JobFilters.tsx';
import { navigate } from '../router.ts';

interface Props {
  /** `jobs` shows scored, active jobs; `filtered` shows what the pre-filter rejected. */
  mode: 'jobs' | 'filtered';
  selectedId: number | null;
}

const DEFAULT_QUERY: Record<Props['mode'], JobsQuery> = {
  jobs: { sort: 'fit', minFit: 6, status: 'new' },
  filtered: { sort: 'date', status: 'filtered' },
};

function toSummary(job: Job): JobSummary {
  const { description: _description, coverLetter, ...rest } = job;
  return { ...rest, hasCoverLetter: coverLetter !== null };
}

export function JobsPage({ mode, selectedId }: Props) {
  const [query, setQuery] = useState<JobsQuery>(DEFAULT_QUERY[mode]);
  const base = mode === 'filtered' ? '#/filtered' : '#/jobs';
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.jobs
      .list(query)
      .then((result) => {
        if (!cancelled) setJobs(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    if (selectedId === null) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    api.jobs
      .get(selectedId)
      .then((job) => {
        if (!cancelled) setSelected(job);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleJobChange = useCallback((job: Job) => {
    setSelected(job);
    setJobs((current) => current.map((item) => (item.id === job.id ? toSummary(job) : item)));
  }, []);

  return (
    <div className="jobs">
      <div className="jobs__list">
        <JobFilters query={query} onChange={setQuery} lockStatus={mode === 'filtered'} />
        {error && <p className="jobs__error">{error}</p>}
        {loading && jobs.length === 0 && <p className="jobs__empty">Loading…</p>}
        {!loading && jobs.length === 0 && <p className="jobs__empty">Nothing here yet.</p>}
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            selected={job.id === selectedId}
            onSelect={(id) => navigate(`${base}/${id}`)}
          />
        ))}
      </div>
      <aside className="jobs__detail">
        {selected ? (
          <JobDetail job={selected} onJobChange={handleJobChange} />
        ) : (
          <p className="jobs__empty">Select a job to see details.</p>
        )}
      </aside>
    </div>
  );
}
