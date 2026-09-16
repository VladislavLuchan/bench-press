import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job, JobStatus, JobSummary } from '@bench-press/shared/types';
import {
  api,
  errorMessage,
  JOBS_CHANGED_EVENT,
  type JobsQuery,
  type JobWithEvents,
} from '../api/client.ts';
import { toastError } from '../lib/toast.ts';
import { JobCard } from '../components/JobCard.tsx';
import { JobDetail } from '../components/JobDetail.tsx';
import { JobFilters } from '../components/JobFilters.tsx';
import { emitHotkeyAction, useHotkeys } from '../hooks/useHotkeys.ts';
import { openInWindow } from '../lib/open.ts';
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

function toSummary(job: Job | JobWithEvents): JobSummary {
  const { description: _description, coverLetter, ...rest } = job;
  const { events: _events, ...summary } = rest as typeof rest & { events?: unknown };
  return { ...summary, hasCoverLetter: coverLetter !== null };
}

export function JobsPage({ mode, selectedId }: Props) {
  const [query, setQueryState] = useState<JobsQuery>(() => loadQuery(mode));
  const base = mode === 'filtered' ? '#/filtered' : '#/jobs';
  const setQuery = (next: JobsQuery) => {
    saveQuery(mode, next);
    setQueryState(next);
  };
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selected, setSelected] = useState<JobWithEvents | null>(null);
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

  const handleJobChange = useCallback((job: Job | JobWithEvents) => {
    setSelected((current) => ({
      ...job,
      events: 'events' in job ? job.events : (current?.events ?? []),
    }));
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
        .catch((err: unknown) => toastError(`Could not update: ${errorMessage(err)}`));
    },
    [selectedId],
  );

  const selectedJob = jobs.find((job) => job.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId === null) return;
    const card = document.querySelector<HTMLElement>(`[data-job-id="${selectedId}"]`);
    card?.scrollIntoView({ block: 'nearest' });
    if (card && document.activeElement?.tagName !== 'TEXTAREA') card.focus({ preventScroll: true });
  }, [selectedId, jobs]);
  const hotkeys = useMemo(() => {
    const move = (delta: number) => {
      const index = jobs.findIndex((job) => job.id === selectedId);
      const next = index === -1 ? 0 : Math.min(jobs.length - 1, Math.max(0, index + delta));
      const job = jobs[next];
      if (job) navigate(`${base}/${job.id}`);
    };
    const setStatus = (status: JobStatus) => {
      if (selectedJob && mode === 'jobs') quickStatus(selectedJob.id, status);
    };
    return [
      { keys: ['j', 'ArrowDown', 'alt+j'], description: 'next job', action: () => move(1) },
      { keys: ['k', 'ArrowUp', 'alt+k'], description: 'previous job', action: () => move(-1) },
      { keys: ['Enter'], description: 'select first job', action: () => move(0) },
      { keys: ['Escape'], description: 'close detail', action: () => navigate(base) },
      {
        keys: ['/', 'alt+/'],
        description: 'focus filters',
        action: () =>
          document.querySelector<HTMLElement>('.filters input, .filters select')?.focus(),
      },
      {
        keys: ['o', 'alt+o'],
        description: 'open listing',
        action: () => {
          if (selectedJob) openInWindow(selectedJob.url);
        },
      },
      { keys: ['g', 'alt+g'], description: 'generate cover letter', action: () => emitHotkeyAction('generate') },
      { keys: ['c', 'alt+c'], description: 'copy cover letter and open', action: () => emitHotkeyAction('copy-open') },
      { keys: ['a', 'alt+a'], description: 'applied', action: () => setStatus('applied') },
      { keys: ['r', 'alt+r'], description: 'replied', action: () => setStatus('replied') },
      { keys: ['s', 'alt+s'], description: 'skipped', action: () => setStatus('skipped') },
      { keys: ['n', 'alt+n'], description: 'reset to new', action: () => setStatus('new') },
    ];
  }, [jobs, selectedId, selectedJob, base, mode, quickStatus]);
  useHotkeys(hotkeys);

  return (
    <div className="jobs">
      <div className="jobs__list">
        <JobFilters query={query} onChange={setQuery} lockStatus={mode === 'filtered'} />
        <p className="jobs__count">
          {loading ? 'Loading…' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}
          <span className="jobs__hint"> · press ? for shortcuts</span>
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
