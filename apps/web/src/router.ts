import { useSyncExternalStore } from 'react';

export type Route =
  { name: 'jobs'; jobId: number | null } | { name: 'stats' } | { name: 'settings' };

/** Hash routes keep the dashboard a single static file with no server-side rewrites. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '/stats') return { name: 'stats' };
  if (path === '/settings') return { name: 'settings' };
  const filtered = path.match(/^\/filtered(?:\/(\d+))?$/);
  if (filtered) return { name: 'filtered', jobId: filtered[1] ? Number(filtered[1]) : null };
  const job = path.match(/^\/jobs\/(\d+)$/);
  return { name: 'jobs', jobId: job ? Number(job[1]) : null };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}
