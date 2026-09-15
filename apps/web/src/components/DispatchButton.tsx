import { useEffect, useState } from 'react';
import { errorMessage, type FetchStatus } from '../api/client.ts';

interface Props {
  label: string;
  busyLabel: string;
  status: () => Promise<FetchStatus>;
  trigger: () => Promise<FetchStatus>;
  className?: string;
}

function remainingMinutes(until: string | null): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
}

/** Button for a workflow_dispatch action with a server-side cooldown. */
export function DispatchButton({ label, busyLabel, status, trigger, className = 'btn' }: Props) {
  const [state, setState] = useState<FetchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    status()
      .then(setState)
      .catch(() => setState(null));
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [status]);

  const minutes = remainingMinutes(state?.cooldownUntil ?? null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await trigger());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="dispatch">
      <button
        type="button"
        className={className}
        disabled={busy || minutes > 0}
        onClick={() => void run()}
        title={error ?? (minutes > 0 ? `Available again in ${minutes} min` : label)}
      >
        {busy ? 'Starting…' : minutes > 0 ? `${busyLabel} ${minutes} min` : label}
      </button>
      {error && <span className="dispatch__error">{error}</span>}
    </span>
  );
}
