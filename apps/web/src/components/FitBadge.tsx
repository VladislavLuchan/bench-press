import { fitTone } from '../lib/format.ts';

export function FitBadge({ fit }: { fit: number | null }) {
  return (
    <span className={`fit-badge fit-badge--${fitTone(fit)}`} title="Fit score 1-10">
      {fit ?? '–'}
    </span>
  );
}
