import { useEffect } from 'react';
import { api } from '../api/client.ts';
import { toast } from '../lib/toast.ts';

const CHECK_EVERY_MS = 20 * 60 * 1000;
/** Focus events come in bursts; one check per this interval is enough. */
const MIN_GAP_MS = 5 * 60 * 1000;

/**
 * While the dashboard is open, asks the API to start a scrape if the cron has fallen behind
 * (GitHub drops scheduled runs). The server decides; most calls are no-ops.
 */
export function useCatchUp(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const check = () => {
      if (Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      api.fetchNow
        .catchUp()
        .then((result) => {
          if (result.started) toast('The last scrape was over an hour ago; started a new one.');
        })
        .catch(() => {
          // Not critical: the cron still runs, and Fetch now is there by hand.
        });
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [enabled]);
}
