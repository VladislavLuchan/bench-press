import { JOB_STATUSES, SOURCE_NAMES } from '@bench-press/shared/types';
import type { JobsQuery } from '../api/client.ts';

interface Props {
  query: JobsQuery;
  onChange: (query: JobsQuery) => void;
  /** The Filtered tab pins status to `filtered`. */
  lockStatus?: boolean;
}

export function JobFilters({ query, onChange, lockStatus = false }: Props) {
  const update = (patch: Partial<JobsQuery>) => onChange({ ...query, ...patch });

  return (
    <div className="filters">
      <label className="field field--inline">
        <span className="field__label">Min fit</span>
        <input
          className="field__input field__input--short"
          type="number"
          min={0}
          max={10}
          value={query.minFit ?? ''}
          onChange={(event) =>
            update({ minFit: event.target.value === '' ? undefined : Number(event.target.value) })
          }
        />
      </label>
      <label className="field field--inline">
        <span className="field__label">Source</span>
        <select
          className="field__input"
          value={query.source ?? ''}
          onChange={(event) => update({ source: event.target.value || undefined })}
        >
          <option value="">all</option>
          {SOURCE_NAMES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--inline">
        <span className="field__label">Status</span>
        <select
          className="field__input"
          value={query.status ?? ''}
          disabled={lockStatus}
          onChange={(event) => update({ status: event.target.value || undefined })}
        >
          <option value="">all active</option>
          {JOB_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className="field field--inline">
        <span className="field__label">Since</span>
        <input
          className="field__input"
          type="date"
          value={query.since ?? ''}
          onChange={(event) => update({ since: event.target.value || undefined })}
        />
      </label>
      <label className="field field--inline">
        <span className="field__label">Sort</span>
        <select
          className="field__input"
          value={query.sort ?? 'fit'}
          onChange={(event) => update({ sort: event.target.value as JobsQuery['sort'] })}
        >
          <option value="fit">by fit</option>
          <option value="date">by date</option>
        </select>
      </label>
    </div>
  );
}
