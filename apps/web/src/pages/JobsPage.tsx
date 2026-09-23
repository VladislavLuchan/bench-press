import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job, JobStatus, JobSummary } from '@bench-press/shared/types';
import {
  api,
  errorMessage,
  JOB_UPDATED_EVENT,
  JOBS_CHANGED_EVENT,
  type JobsQuery,
  type JobWithEvents,
} from '../api/client.ts';
import { toastError } from '../lib/toast.ts';
import { ExportMenu } from '../components/ExportMenu.tsx';
import { JobCard } from '../components/JobCard.tsx';
import { JobDetail } from '../components/JobDetail.tsx';
import { JobFilters } from '../components/JobFilters.tsx';
import { emitHotkeyAction, useHotkeys } from '../hooks/useHotkeys.ts';
import { companyKey } from '../lib/company.ts';
import { openListing } from '../lib/pending-apply.ts';
import { navigate } from '../router.ts';

interface Props {
  /** `jobs` shows scored, active jobs; `filtered` shows what the pre-filter rejected. */
  mode: 'jobs' | 'filtered';
  selectedId: number | null;
}

const DEFAULT_QUERY: Record<Props['mode'], JobsQuery> = {
  jobs: {
    sort: 'fit',
    minFit: 6,
    status: 'new',
    locationType: ['remote', 'unclear', 'unscored'],
    roleType: ['frontend', 'fullstack'],
  },
  filtered: { sort: 'date', status: 'filtered' },
};

// Bump the suffix when defaults change, so saved filters do not hide new ones.
const QUERY_STORAGE_KEY = 'bench-press.filters.v2';

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
  const [listed, setJobs] = useState<JobSummary[]>([]);
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

  // Updates from anywhere (the "Applied?" prompt included) land in the list and the detail.
  useEffect(() => {
    const onUpdated = (event: Event) => {
      const job = (event as CustomEvent<JobWithEvents>).detail;
      setJobs((current) => current.map((item) => (item.id === job.id ? toSummary(job) : item)));
      setSelected((current) => (current?.id === job.id ? job : current));
    };
    window.addEventListener(JOB_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(JOB_UPDATED_EVENT, onUpdated);
  }, []);

  // One block per company, placed where its best role sits in the sorted list.
  const groups = useMemo(() => {
    const byCompany = new Map<string, { key: string; company: string; jobs: JobSummary[] }>();
    for (const job of listed) {
      const key = companyKey(job.company) ?? `job-${job.id}`;
      const group = byCompany.get(key) ?? {
        key,
        company: job.company ?? 'unknown company',
        jobs: [],
      };
      group.jobs.push(job);
      byCompany.set(key, group);
    }
    return [...byCompany.values()];
  }, [listed]);
  // Keyboard navigation follows the order on screen, which grouping changes.
  const jobs = useMemo(() => groups.flatMap((group) => group.jobs), [groups]);

  const quickStatus = useCallback(
    (id: number, status: JobStatus) => {
      // Triage keeps moving: a verdict on the open job shows the next one still waiting.
      if (id === selectedId && (status === 'applied' || status === 'skipped')) {
        const index = jobs.findIndex((job) => job.id === id);
        const next = jobs.slice(index + 1).find((job) => job.status === 'new');
        if (next) navigate(`${base}/${next.id}`);
      }
      api.jobs
        .update(id, { status })
        .then(() => window.dispatchEvent(new Event(JOBS_CHANGED_EVENT)))
        .catch((err: unknown) => toastError(`Could not update: ${errorMessage(err)}`));
    },
    [selectedId, jobs, base],
  );

  const renderCard = (job: JobSummary, hideCompany: boolean) => (
    <JobCard
      key={job.id}
      job={job}
      hideCompany={hideCompany}
      selected={job.id === selectedId}
      onSelect={(id) => navigate(`${base}/${id}`)}
      onQuickStatus={mode === 'jobs' ? quickStatus : undefined}
    />
  );

  const selectedJob = jobs.find((job) => job.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId === null) return;
    const card = document.querySelector<HTMLElement>(`[data-job-id="${selectedId}"]`);
    card?.scrollIntoView({ block: 'nearest' });
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
          if (selectedJob) openListing(selectedJob);
        },
      },
      {
        keys: ['g', 'alt+g'],
        description: 'generate cover letter',
        action: () => emitHotkeyAction('generate'),
      },
      {
        keys: ['c', 'alt+c'],
        description: 'copy cover letter and open',
        action: () => emitHotkeyAction('copy-open'),
      },
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
        <ExportMenu scope="jobs" query={query} />
        {error && <p className="jobs__error">{error}</p>}
        {!loading && jobs.length === 0 && (
          <p className="jobs__empty">Nothing matches these filters.</p>
        )}
        {groups.map((group) =>
          group.jobs.length === 1 ? (
            renderCard(group.jobs[0] as JobSummary, false)
          ) : (
            <section key={group.key} className="company-group">
              <h3 className="company-group__title">
                {group.company}{' '}
                <span className="company-group__count">{group.jobs.length} roles</span>
              </h3>
              {group.jobs.map((job) => renderCard(job, true))}
            </section>
          ),
        )}
      </div>
      <aside className="jobs__detail">
        {selected ? (
          <JobDetail
            job={selected}
            onJobChange={handleJobChange}
            onStatus={(status) => quickStatus(selected.id, status)}
          />
        ) : (
          <p className="jobs__empty">Select a job to see details.</p>
        )}
      </aside>
    </div>
  );
}
