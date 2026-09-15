// Only type imports from the shared package: its value exports pull in the database client.
import type {
  DashboardStats,
  Job,
  JobStatus,
  JobSummary,
  Run,
  SettingKey,
} from '@bench-press/shared/types';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  return (await response.json()) as T;
}

export interface JobsQuery {
  minFit?: number;
  source?: string;
  status?: string;
  since?: string;
  sort?: 'fit' | 'date';
}

export interface CoverLetterResponse {
  coverLetter: string;
  lang: string | null;
  cached: boolean;
}

export type Settings = Record<SettingKey, string>;

export const api = {
  jobs: {
    list(query: JobsQuery): Promise<JobSummary[]> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      return request(`/jobs?${params}`);
    },
    get: (id: number): Promise<Job> => request(`/jobs/${id}`),
    update(id: number, body: { status?: JobStatus; coverLetter?: string }): Promise<Job> {
      return request(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    coverLetter(id: number, force = false): Promise<CoverLetterResponse> {
      return request(`/jobs/${id}/cover-letter`, { method: 'POST', body: JSON.stringify({ force }) });
    },
  },
  stats: (): Promise<DashboardStats> => request('/stats'),
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
