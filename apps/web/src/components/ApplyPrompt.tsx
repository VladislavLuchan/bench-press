import { useMemo } from 'react';
import type { JobStatus } from '@bench-press/shared/types';
import { api, errorMessage, JOBS_CHANGED_EVENT } from '../api/client.ts';
import { useHotkeys } from '../hooks/useHotkeys.ts';
import { dropPendingApply, usePendingApplies, type PendingApply } from '../lib/pending-apply.ts';
import { toast, toastError } from '../lib/toast.ts';

function setStatus(item: PendingApply, status: JobStatus): void {
  api.jobs
    .update(item.id, { status })
    .then(() => {
      window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
      toast(`${status === 'applied' ? 'Applied' : 'Skipped'}: ${item.title}`);
    })
    .catch((err: unknown) => toastError(`Could not update: ${errorMessage(err)}`));
}

/**
 * Asks "Applied?" for every listing opened from the dashboard, wherever the user is now.
 * The answer is one click or `y`, so there is no need to find the job again after sending
 * the application on the job site.
 */
export function ApplyPrompt() {
  const pending = usePendingApplies();
  const latest = pending[0];

  useHotkeys(
    useMemo(
      () => [
        {
          keys: ['y', 'alt+y'],
          description: 'applied to the job in the prompt',
          action: () => {
            if (latest) setStatus(latest, 'applied');
          },
        },
      ],
      [latest],
    ),
    latest !== undefined,
  );

  if (pending.length === 0) return null;
  return (
    <div className="apply-prompt" aria-live="polite">
      {pending.map((item, index) => (
        <div
          key={item.id}
          className={`apply-prompt__item ${item.closed ? 'apply-prompt__item--closed' : ''}`}
        >
          <p className="apply-prompt__text">
            Applied to <strong>{item.title}</strong>
            {item.company && ` at ${item.company}`}?
          </p>
          <div className="apply-prompt__actions">
            <button
              type="button"
              className="btn btn--primary btn--small"
              title={index === 0 ? 'Shortcut: y' : undefined}
              onClick={() => setStatus(item, 'applied')}
            >
              Applied{index === 0 && ' (y)'}
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setStatus(item, 'skipped')}
            >
              Skip
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              title="Keep it as new and stop asking"
              onClick={() => dropPendingApply(item.id)}
            >
              Not yet
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
