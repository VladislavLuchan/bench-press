// Only type imports from the shared package: its value exports pull in the database client.
import type {
  DashboardStats,
  Job,
  JobEvent,
  JobStage,
  JobStatus,
  JobSummary,
  Run,
  SettingKey,
} from '@bench-press/shared/types';

/** A job as returned by the detail and update endpoints: the row plus its history. */
export type JobWithEvents = Job & { events: JobEvent[] };

export interface JobUpdate {
  status?: JobStatus;
  stage?: JobStage | null;
  notes?: string;
  coverLetter?: string;
}

const TOKEN_KEY = 'bench-press.token';
export const UNAUTHORIZED_EVENT = 'bench-press:unauthorized';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Private mode or blocked storage: the token lives for this page load only.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${tokenStore.get() ?? ''}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`/api${path}`, { ...init, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Non-JSON error body; keep the status text.
    }
    if (response.status === 401) {
      tokenStore.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, message);
  }
  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await (await send(path, init)).json()) as T;
}

function toParams(query: JobsQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else if (typeof value === 'boolean') {
      if (value) params.set(key, '1');
    } else if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  return params;
}

export interface ExportOptions {
  scope: 'jobs' | 'pipeline';
  format: 'md' | 'jsonl';
  description: boolean;
  /** List filters; ignored for the pipeline scope. */
  query?: JobsQuery;
}

export interface ExportFile {
  text: string;
  filename: string;
}

export interface JobsQuery {
  minFit?: number;
  source?: string;
  status?: string;
  since?: string;
  /** Location types to show; `unscored` means jobs without a verdict yet. */
  locationType?: string[];
  roleType?: string[];
  /** Company types to show; empty means all. */
  companyType?: string[];
  dream?: boolean;
  sort?: 'fit' | 'date';
}

export interface CoverLetterResponse {
  coverLetter: string;
  lang: string | null;
  cached: boolean;
}

export type Settings = Record<SettingKey, string>;

export interface FetchStatus {
  requestedAt: string | null;
  cooldownUntil: string | null;
}

/** Fired after a job changes so header counters can refresh. */
export const JOBS_CHANGED_EVENT = 'bench-press:jobs-changed';

/** Fired with the updated job (a CustomEvent) after every successful job update. */
export const JOB_UPDATED_EVENT = 'bench-press:job-updated';

export const api = {
  async export(options: ExportOptions): Promise<ExportFile> {
    const params =
      options.scope === 'jobs' && options.query ? toParams(options.query) : new URLSearchParams();
    params.set('scope', options.scope);
    params.set('format', options.format);
    params.set('description', options.description ? '1' : '0');
    const response = await send(`/export?${params}`);
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `bench-press.${options.format}`;
    return { text: await response.text(), filename };
  },
  jobs: {
    list(query: JobsQuery): Promise<JobSummary[]> {
      return request(`/jobs?${toParams(query)}`);
    },
    get: (id: number): Promise<JobWithEvents> => request(`/jobs/${id}`),
    async update(id: number, body: JobUpdate): Promise<JobWithEvents> {
      const job = await request<JobWithEvents>(`/jobs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      window.dispatchEvent(new CustomEvent<JobWithEvents>(JOB_UPDATED_EVENT, { detail: job }));
      return job;
    },
    pipeline: (): Promise<JobSummary[]> => request('/pipeline'),
    /** The stored letter as a PDF, named for the employer. */
    async coverLetterPdf(id: number): Promise<{ blob: Blob; filename: string }> {
      const response = await send(`/jobs/${id}/cover-letter.pdf`);
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const encoded = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
      const filename = encoded ? decodeURIComponent(encoded) : 'Cover_Letter.pdf';
      return { blob: await response.blob(), filename };
    },
    coverLetter(id: number, force = false): Promise<CoverLetterResponse> {
      return request(`/jobs/${id}/cover-letter`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
    },
  },
  stats: (): Promise<DashboardStats> => request('/stats'),
  fetchNow: {
    status: (): Promise<FetchStatus> => request('/fetch-now'),
    trigger: (): Promise<FetchStatus> => request('/fetch-now', { method: 'POST' }),
    /** Starts a run only when the last one is over an hour old (the cron skipped slots). */
    catchUp: (): Promise<{ started: boolean }> =>
      request('/fetch-now/catch-up', { method: 'POST' }),
  },
  rescore: {
    status: (): Promise<FetchStatus> => request('/rescore'),
    trigger: (): Promise<FetchStatus> => request('/rescore', { method: 'POST' }),
  },
  runs: (): Promise<Run[]> => request('/runs'),
  settings: {
    get: (): Promise<Settings> => request('/settings'),
    update: (body: Partial<Settings>): Promise<Settings> =>
      request('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
