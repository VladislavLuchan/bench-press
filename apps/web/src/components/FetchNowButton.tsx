import { useEffect, useState } from 'react';
import { api, errorMessage, type FetchStatus } from '../api/client.ts';

function remainingMinutes(until: string | null): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
}

/** Triggers the GitHub scrape workflow; disabled while the 20 minute cooldown runs. */
export function FetchNowButton() {
  const [status, setStatus] = useState<FetchStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    api.fetchNow
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const minutes = remainingMinutes(status?.cooldownUntil ?? null);

  const trigger = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.fetchNow.trigger());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="fetch-now">
      <button
        type="button"
        className="btn"
        disabled={busy || minutes > 0}
        onClick={() => void trigger()}
        title={error ?? (minutes > 0 ? `Next manual run in ${minutes} min` : 'Run the scraper now')}
      >
        {busy ? 'Starting…' : minutes > 0 ? `Running… ${minutes} min` : 'Fetch now'}
      </button>
      {error && <span className="fetch-now__error">{error}</span>}
    </span>
  );
}
