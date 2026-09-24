import type { Run } from '@bench-press/shared/types';
import { formatDateTime } from '../lib/format.ts';

/** Last scraper runs with per-source outcome, so a silently blocked source is visible. */
export function RunsHealth({ runs }: { runs: Run[] }) {
  return (
    <section className="runs">
      <h2 className="runs__title">Scraper runs</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Started</th>
              <th>Sources</th>
              <th>New</th>
              <th>Filtered</th>
              <th>Scored</th>
              <th>Notified</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className={run.error ? 'table__row--bad' : ''}>
                <td>{formatDateTime(run.startedAt)}</td>
                <td>
                  {Object.entries(run.stats?.sources ?? {}).map(
                    ([name, stats]) =>
                      stats && (
                        <span
                          key={name}
                          className={`runs__source ${stats.error ? 'runs__source--bad' : ''} ${stats.skipped ? 'runs__source--skipped' : ''}`}
                          title={
                            stats.error ??
                            (stats.skipped
                              ? 'skipped: backing off or fetched recently'
                              : `${stats.listed} listed, ${stats.fresh ?? '?'} new to us, ` +
                                `${stats.kept ?? '?'} passed the filters`)
                          }
                        >
                          {name} {stats.skipped ? '⏸' : stats.error ? '✗' : stats.listed}
                          {!stats.skipped && stats.fresh ? ` +${stats.fresh}` : ''}
                        </span>
                      ),
                  )}
                </td>
                <td>{run.stats?.inserted ?? '–'}</td>
                <td>{run.stats?.filtered ?? '–'}</td>
                <td>
                  {run.stats?.scored ?? '–'}
                  {run.stats?.scoreErrors ? ` (${run.stats.scoreErrors} failed)` : ''}
                </td>
                <td>{run.stats?.notified ?? '–'}</td>
                <td className="table__cell--muted">
                  {run.error ?? (run.finishedAt ? '' : 'running')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
