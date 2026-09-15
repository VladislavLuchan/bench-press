import type { LocationType } from '@bench-press/shared/types';

const LABELS: Record<LocationType, string> = {
  remote: 'remote',
  remote_region_limited: 'region-limited',
  hybrid: 'hybrid',
  onsite: 'on-site',
  unclear: 'location?',
};

const TONES: Record<LocationType, 'good' | 'warn' | 'bad' | 'muted'> = {
  remote: 'good',
  remote_region_limited: 'warn',
  hybrid: 'warn',
  onsite: 'bad',
  unclear: 'muted',
};

export function LocationBadge({ type }: { type: LocationType | null }) {
  if (!type) return null;
  return (
    <span className={`location-badge location-badge--${TONES[type]}`} title={`Location: ${type}`}>
      {LABELS[type]}
    </span>
  );
}
