import { getSetting, setSetting } from '@bench-press/shared';
import { HttpError, json } from '../lib/http.ts';
import type { Handler } from '../lib/router.ts';

/** Minimum gap between manual runs; the cron already runs every two hours. */
const COOLDOWN_MS = 20 * 60 * 1000;
const WORKFLOW_FILE = 'scrape.yml';

function cooldownUntil(requestedAt: string | null): string | null {
  if (!requestedAt) return null;
  const until = new Date(requestedAt).getTime() + COOLDOWN_MS;
  return until > Date.now() ? new Date(until).toISOString() : null;
}

export const fetchStatusHandler: Handler = async ({ db }) => {
  const requestedAt = await getSetting(db, 'fetch_requested_at');
  return json({ requestedAt, cooldownUntil: cooldownUntil(requestedAt) });
};

/**
 * POST /api/fetch-now: asks GitHub to run the scrape workflow. Scraping never happens in a
 * Vercel function; this only presses the same button as workflow_dispatch in the UI.
 */
export const fetchNowHandler: Handler = async ({ db }) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? 'VladislavLuchan/bench-press';
  if (!token) throw new HttpError(503, 'GITHUB_TOKEN is not configured on the dashboard');

  const previous = await getSetting(db, 'fetch_requested_at');
  const blockedUntil = cooldownUntil(previous);
  if (blockedUntil) {
    return json({ requestedAt: previous, cooldownUntil: blockedUntil }, 429);
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'bench-press-dashboard',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );
  if (response.status !== 204) {
    const body = await response.text().catch(() => '');
    throw new HttpError(502, `GitHub dispatch failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const requestedAt = new Date().toISOString();
  await setSetting(db, 'fetch_requested_at', requestedAt);
  return json({ requestedAt, cooldownUntil: cooldownUntil(requestedAt) });
};
