import { useSyncExternalStore } from 'react';
import type { JobSummary } from '@bench-press/shared/types';
import { JOB_UPDATED_EVENT, JOBS_CHANGED_EVENT, type JobWithEvents } from '../api/client.ts';
import { hasExtension, onExtensionMessage, openInExtensionWindow } from './extension.ts';
import { openInWindow } from './open.ts';

/**
 * A `new` job whose listing was opened from the dashboard and still has no verdict. The
 * app shell asks "Applied?" for each one, so the user never has to find the job again after
 * filling the form on the job site.
 */
export interface PendingApply {
  id: number;
  title: string;
  company: string | null;
  /** The listing window was closed: the likely moment the application was sent. */
  closed: boolean;
}

const STORAGE_KEY = 'bench-press.pending-apply';
const MAX_PENDING = 5;
const CLOSE_POLL_MS = 1000;

function load(): PendingApply[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as PendingApply[]) : [];
  } catch {
    return [];
  }
}

let pending: PendingApply[] = load();
const listeners = new Set<() => void>();

function save(next: PendingApply[]): void {
  pending = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable; the prompt lives for this page load only.
  }
  for (const listener of listeners) listener();
}

export function dropPendingApply(id: number): void {
  if (pending.some((item) => item.id === id)) save(pending.filter((item) => item.id !== id));
}

function markClosed(id: number): void {
  if (pending.some((item) => item.id === id && !item.closed)) {
    save(pending.map((item) => (item.id === id ? { ...item, closed: true } : item)));
  }
}

type Listing = Pick<JobSummary, 'id' | 'title' | 'company' | 'url' | 'status'>;

/**
 * Opens the listing and, for a job still in `new`, remembers it until the user answers the
 * "Applied?" prompt or changes its status. Must run inside a click or keydown handler.
 */
export function openListing(job: Listing): void {
  // The extension reports its window closing itself (see the listener below).
  const viaExtension = hasExtension();
  const popup = viaExtension ? null : openInWindow(job.url);
  if (viaExtension) openInExtensionWindow(job);
  if (job.status !== 'new') return;
  const entry: PendingApply = { id: job.id, title: job.title, company: job.company, closed: false };
  save([entry, ...pending.filter((item) => item.id !== job.id)].slice(0, MAX_PENDING));
  if (!popup) return;
  const timer = window.setInterval(() => {
    if (!popup.closed) return;
    window.clearInterval(timer);
    markClosed(job.id);
  }, CLOSE_POLL_MS);
}

// Any status change, from the prompt, a hotkey or the detail panel, answers the question.
window.addEventListener(JOB_UPDATED_EVENT, (event) => {
  const job = (event as CustomEvent<JobWithEvents>).detail;
  if (job.status !== 'new') dropPendingApply(job.id);
});

// Status changes made in the extension's side panel reach the dashboard through the bridge.
onExtensionMessage((message) => {
  if (message.type === 'job-window-closed') markClosed(message.jobId);
  if (message.type === 'job-updated') {
    window.dispatchEvent(
      new CustomEvent<JobWithEvents>(JOB_UPDATED_EVENT, { detail: message.job }),
    );
    window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
  }
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingApplies(): PendingApply[] {
  return useSyncExternalStore(subscribe, () => pending);
}
