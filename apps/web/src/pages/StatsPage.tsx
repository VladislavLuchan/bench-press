import { useEffect, useState } from 'react';
import type { ConversionRow, DailyCount, DashboardStats, Run } from '@bench-press/shared/types';
import { api, errorMessage } from '../api/client.ts';
import { RunsHealth } from '../components/RunsHealth.tsx';

function BarChart({ title, data }: { title: string; data: DailyCount[] }) {
  const max = Math.max(1, ...data.map((point) => point.count));
  return (
    <section className="bar-chart">
      <h2 className="bar-chart__title">{title}</h2>
      {data.length === 0 && <p className="stats__empty">No applications yet.</p>}
      <ul className="bar-chart__bars">
        {data.map((point) => (
          <li key={point.day} className="bar-chart__row">
            <span className="bar-chart__label">{point.day}</span>
            <span className="bar-chart__bar" style={{ width: `${(point.count / max) * 100}%` }} />
            <span className="bar-chart__value">{point.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Conversion({ title, rows }: { title: string; rows: ConversionRow[] }) {
  return (
    <section className="conversion">
      <h2 className="conversion__title">{title}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Bucket</th>
              <th>Applied</th>
              <th>Replied</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bucket}>
                <td>{row.bucket}</td>
                <td>{row.applied}</td>
                <td>{row.replied}</td>
                <td>{row.applied ? `${Math.round((row.replied / row.applied) * 100)}%` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Distribution({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ bucket: string; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <BarChart
      title={title}
      data={rows.map((row) => ({
        day: `${row.bucket} ${total ? Math.round((row.count / total) * 100) : 0}%`,
        count: row.count,
      }))}
    />
  );
}

export function StatsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.runs()])
      .then(([statsResult, runsResult]) => {
        setStats(statsResult);
        setRuns(runsResult);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  if (error) return <p className="stats__error">{error}</p>;
  if (!stats) return <p className="stats__empty">Loading…</p>;

  return (
    <div className="stats">
      <ul className="stats__totals">
        {Object.entries(stats.totals).map(([status, count]) => (
          <li key={status} className="stat-tile">
            <span className="stat-tile__value">{count}</span>
            <span className="stat-tile__label">{status}</span>
          </li>
        ))}
      </ul>
      <div className="stats__grid">
        <BarChart title="Applications per day (30d)" data={stats.appliedPerDay} />
        <BarChart title="Applications per week (12w)" data={stats.appliedPerWeek} />
        <Conversion title="Replies by source" rows={stats.bySource} />
        <Conversion title="Replies by fit" rows={stats.byFit} />
        <Distribution title="Open jobs by role type" rows={stats.byRoleType} />
        <Distribution title="Open jobs by company type" rows={stats.byCompanyType} />
      </div>
      <RunsHealth runs={runs} />
    </div>
  );
}
