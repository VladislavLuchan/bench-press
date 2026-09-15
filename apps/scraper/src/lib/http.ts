import { config } from '../config.ts';

/** Raised on 429/403 or a redirect to a login wall: the source should back off, not retry. */
export class BlockedError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'BlockedError';
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

export interface HttpClient {
  getText(url: string): Promise<string>;
  /** Same throttling and block detection, for endpoints that need a method or body. */
  request(url: string, init?: RequestInit): Promise<string>;
}

const LOGIN_WALL = /\/(login|authwall|checkpoint|uas\/login)/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Plain fetch wrapper: one User-Agent, a randomized pause between requests to the same
 * host, a timeout, and typed errors so callers can tell "blocked" from "broken".
 * Proxying is handled by Node itself when NODE_USE_ENV_PROXY=1 and HTTPS_PROXY are set.
 */
export function createHttpClient(options = config.http): HttpClient {
  const lastRequestAt = new Map<string, number>();

  async function throttle(host: string): Promise<void> {
    const delay = options.minDelayMs + Math.random() * (options.maxDelayMs - options.minDelayMs);
    const readyAt = (lastRequestAt.get(host) ?? 0) + delay;
    const wait = readyAt - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());
  }

  async function request(url: string, init: RequestInit = {}): Promise<string> {
      await throttle(new URL(url).host);
      const headers = new Headers(init.headers);
      headers.set('User-Agent', options.userAgent);
      if (!headers.has('Accept')) {
        headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
      }
      headers.set('Accept-Language', 'en-US,en;q=0.9,uk;q=0.8');
      const response = await fetch(url, {
        ...init,
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      if (response.status === 429 || response.status === 403) {
        throw new BlockedError(`HTTP ${response.status} (rate limited or blocked)`, url);
      }
      if (LOGIN_WALL.test(new URL(response.url).pathname)) {
        throw new BlockedError(`Redirected to a login wall: ${response.url}`, url);
      }
      if (!response.ok) throw new HttpError(response.status, url);
      return response.text();
  }

  return { request, getText: (url) => request(url) };
}
