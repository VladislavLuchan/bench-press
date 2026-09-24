import {
  COMPANY_TYPES,
  LOCATION_TYPES,
  ROLE_TYPES,
  SOURCE_NAMES,
  type JobStatus,
} from '@bench-press/shared/types';
import type { JobsQuery } from '../api/client.ts';

interface Props {
  query: JobsQuery;
  onChange: (query: JobsQuery) => void;
  /**
   * `jobs` lists only unseen (`new`) jobs, so it has no status choice. `filtered` switches
   * between what the rules rejected and what the user skipped.
   */
  mode: 'jobs' | 'filtered';
}

const HIDDEN_STATUSES: Array<{ status: JobStatus; label: string }> = [
  { status: 'filtered', label: 'filtered by rules' },
  { status: 'skipped', label: 'skipped by me' },
];

const LOCATION_OPTIONS = [...LOCATION_TYPES, 'unscored'] as const;
const LOCATION_LABELS: Record<(typeof LOCATION_OPTIONS)[number], string> = {
  remote: 'remote',
  remote_region_limited: 'region-limited',
  hybrid: 'hybrid',
  onsite: 'on-site',
  unclear: 'unclear',
  unscored: 'not scored yet',
};

export function JobFilters({ query, onChange, mode }: Props) {
  const lockStatus = mode === 'filtered';
  const update = (patch: Partial<JobsQuery>) => onChange({ ...query, ...patch });
  const locations = query.locationType ?? [];
  const roles = query.roleType ?? [];
  const companies = query.companyType ?? [];
  const toggle = (key: 'roleType' | 'companyType', type: string) => {
    const current = query[key] ?? [];
    update({
      [key]: current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    });
  };
  const toggleLocation = (type: string) =>
    update({
      locationType: locations.includes(type)
        ? locations.filter((item) => item !== type)
        : [...locations, type],
    });

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
      {mode === 'filtered' && (
        <label className="field field--inline">
          <span className="field__label">Show</span>
          <select
            className="field__input"
            value={query.status ?? 'filtered'}
            onChange={(event) => update({ status: event.target.value })}
          >
            {HIDDEN_STATUSES.map(({ status, label }) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field field--inline">
        <span className="field__label">Since</span>
        <input
          className="field__input"
          type="date"
          value={query.since ?? ''}
          onChange={(event) => update({ since: event.target.value || undefined })}
        />
      </label>
      {!lockStatus && (
        <fieldset className="field field--inline filters__locations">
          <legend className="field__label">Role</legend>
          {ROLE_TYPES.map((type) => (
            <label key={type} className={`chip ${roles.includes(type) ? 'chip--on' : ''}`}>
              <input
                type="checkbox"
                checked={roles.includes(type)}
                onChange={() => toggle('roleType', type)}
              />
              {type}
            </label>
          ))}
        </fieldset>
      )}
      {!lockStatus && (
        <fieldset className="field field--inline filters__locations">
          <legend className="field__label">Company</legend>
          {COMPANY_TYPES.map((type) => (
            <label key={type} className={`chip ${companies.includes(type) ? 'chip--on' : ''}`}>
              <input
                type="checkbox"
                checked={companies.includes(type)}
                onChange={() => toggle('companyType', type)}
              />
              {type}
            </label>
          ))}
          <label
            className={`chip ${query.dream ? 'chip--on' : ''}`}
            title="Remote product companies with a special match"
          >
            <input
              type="checkbox"
              checked={Boolean(query.dream)}
              onChange={() => update({ dream: !query.dream })}
            />
            ⭐ dream only
          </label>
        </fieldset>
      )}
      {!lockStatus && (
        <fieldset className="field field--inline filters__locations">
          <legend className="field__label">Location</legend>
          {LOCATION_OPTIONS.map((type) => (
            <label key={type} className={`chip ${locations.includes(type) ? 'chip--on' : ''}`}>
              <input
                type="checkbox"
                checked={locations.includes(type)}
                onChange={() => toggleLocation(type)}
              />
              {LOCATION_LABELS[type]}
            </label>
          ))}
        </fieldset>
      )}
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
