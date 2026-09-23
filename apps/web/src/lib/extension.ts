import type { JobWithEvents } from '../api/client.ts';

/**
 * Bridge to the bench-press browser extension (apps/extension). Its content script marks the
 * page with a data attribute and relays window.postMessage traffic to the extension. Without
 * the extension nothing listens and the dashboard falls back to popup windows.
 */
const PAGE_SOURCE = 'bench-press-page';
const EXTENSION_SOURCE = 'bench-press-extension';

export interface JobRef {
  id: number;
  title: string;
  company: string | null;
  url: string;
}

export type ExtensionMessage =
  { type: 'job-window-closed'; jobId: number } | { type: 'job-updated'; job: JobWithEvents };

export function hasExtension(): boolean {
  return Boolean(document.documentElement.dataset.benchPressExtension);
}

/**
 * Opens the listing in a normal browser window owned by the extension. Unlike a popup it has
 * tabs, so the employer site behind an "Apply" link opens in the same window.
 */
export function openInExtensionWindow(job: JobRef): void {
  const { id, title, company, url } = job;
  window.postMessage(
    { source: PAGE_SOURCE, type: 'open-job', job: { id, title, company, url } },
    window.location.origin,
  );
}

export function onExtensionMessage(handler: (message: ExtensionMessage) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as (ExtensionMessage & { source?: unknown }) | null;
    if (data?.source === EXTENSION_SOURCE) handler(data);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
