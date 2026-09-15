import { useEffect, useState } from 'react';
import type { DashboardStats } from '@bench-press/shared/types';
import { api, JOBS_CHANGED_EVENT } from '../api/client.ts';

/** "new / applied today" in the header; refreshes when a job changes and every minute. */
export function HeaderCounters() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    const load = () => {
      api
        .stats()
        .then(setStats)
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener(JOBS_CHANGED_EVENT, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(JOBS_CHANGED_EVENT, load);
    };
  }, []);

  if (!stats) return null;
  return (
    <span className="counters" title="New jobs / applied today">
      <span className="counters__item">
        <b>{stats.totals.new}</b> new
      </span>
      <span className="counters__item">
        <b>{stats.appliedToday}</b> applied today
      </span>
    </span>
  );
}
