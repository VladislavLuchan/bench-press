import type { CompanyType, RoleType } from '@bench-press/shared/types';

const ROLE_LABELS: Record<RoleType, string> = {
  frontend: 'frontend',
  fullstack: 'fullstack',
  staff: 'staff+',
};

const COMPANY_TONES: Record<CompanyType, string> = {
  product: 'good',
  outsource: 'neutral',
  agency: 'warn',
  unknown: 'muted',
};

export function RoleBadge({ type }: { type: RoleType }) {
  return (
    <span className={`type-badge type-badge--role-${type}`} title={`Role type: ${type}`}>
      {ROLE_LABELS[type]}
    </span>
  );
}

/** Company type is information, not a score: outsourcing is a neutral colour on purpose. */
export function CompanyBadge({ type }: { type: CompanyType | null }) {
  if (!type) return null;
  return (
    <span
      className={`type-badge type-badge--${COMPANY_TONES[type]}`}
      title={`Company type: ${type}`}
    >
      {type}
    </span>
  );
}

export function DreamBadge({ dream }: { dream: boolean }) {
  if (!dream) return null;
  return (
    <span className="dream-badge" title="Dream: remote product company with a special match">
      ⭐
    </span>
  );
}
