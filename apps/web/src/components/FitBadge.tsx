import { fitTone } from '../lib/format.ts';

interface Props {
  fit: number | null;
  fitRaw?: number | null;
  notes?: string[];
}

/** Fit score; when post-validation changed it, shows "7 → 4" with the reasons as a tooltip. */
export function FitBadge({ fit, fitRaw = null, notes = [] }: Props) {
  const adjusted = fitRaw !== null && fit !== null && fitRaw !== fit;
  const title = adjusted ? `Model said ${fitRaw}, adjusted to ${fit}:\n${notes.join('\n')}` : 'Fit score 1-10';
  return (
    <span className={`fit-badge fit-badge--${fitTone(fit)} ${adjusted ? 'fit-badge--adjusted' : ''}`} title={title}>
      {adjusted ? (
        <>
          <s className="fit-badge__raw">{fitRaw}</s>
          {fit}
        </>
      ) : (
        (fit ?? '–')
      )}
    </span>
  );
}
