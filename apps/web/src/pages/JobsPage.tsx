import { useCallback, useEffect, useState } from 'react';
import type { Job, JobStatus, JobSummary } from '@bench-press/shared/types';
import { api, errorMessage, JOBS_CHANGED_EVENT, type JobsQuery } from '../api/client.ts';
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
  jobs: { sort: 'fit', minFit: 6, status: 'new', locationType: ['remote', 'unclear', 'unscored'] },
  filtered: { sort: 'date', status: 'filtered' },
};

const QUERY_STORAGE_KEY = 'bench-press.filters';

function loadQuery(mode: Props['mode']): JobsQuery {
  try {
    const saved = localStorage.getItem(`${QUERY_STORAGE_KEY}.${mode}`);
    return saved
      ? { ...DEFAULT_QUERY[mode], ...(JSON.parse(saved) as JobsQuery) }
      : DEFAULT_QUERY[mode];
  } catch {
    return DEFAULT_QUERY[mode];
  }
}

function saveQuery(mode: Props['mode'], query: JobsQuery): void {
  try {
    localStorage.setItem(`${QUERY_STORAGE_KEY}.${mode}`, JSON.stringify(query));
  } catch {
    // Storage unavailable; filters simply reset on reload.
  }
}

function toSummary(job: Job): JobSummary {
  const { description: _description, coverLetter, ...rest } = job;
  return { ...rest, hasCoverLetter: coverLetter !== null };
}

export function JobsPage({ mode, selectedId }: Props) {
  const [query, setQueryState] = useState<JobsQuery>(() => loadQuery(mode));
  const base = mode === 'filtered' ? '#/filtered' : '#/jobs';
  const setQuery = (next: JobsQuery) => {
    saveQuery(mode, next);
    setQueryState(next);
  };
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

  const quickStatus = useCallback(
    (id: number, status: JobStatus) => {
      api.jobs
        .update(id, { status })
        .then((job) => {
          setJobs((current) => current.map((item) => (item.id === id ? toSummary(job) : item)));
          if (selectedId === id) setSelected(job);
          window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
        })
        .catch((err: unknown) => setError(errorMessage(err)));
    },
    [selectedId],
  );

  // j / k move the selection, Escape closes the detail panel.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === 'Escape') {
        navigate(base);
        return;
      }
      if (event.key !== 'j' && event.key !== 'k') return;
      const index = jobs.findIndex((job) => job.id === selectedId);
      const next =
        event.key === 'j' ? Math.min(jobs.length - 1, index + 1) : Math.max(0, index - 1);
      const job = jobs[next];
      if (job) navigate(`${base}/${job.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jobs, selectedId, base]);

  return (
    <div className="jobs">
      <div className="jobs__list">
        <JobFilters query={query} onChange={setQuery} lockStatus={mode === 'filtered'} />
        <p className="jobs__count">
          {loading ? 'Loading…' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}
          <span className="jobs__hint"> · j / k to move, Esc to close</span>
        </p>
        {error && <p className="jobs__error">{error}</p>}
        {!loading && jobs.length === 0 && (
          <p className="jobs__empty">Nothing matches these filters.</p>
        )}
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            selected={job.id === selectedId}
            onSelect={(id) => navigate(`${base}/${id}`)}
            onQuickStatus={mode === 'jobs' ? quickStatus : undefined}
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
