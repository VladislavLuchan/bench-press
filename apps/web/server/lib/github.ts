import { getSetting, setSetting, type Db, type SettingKey } from '@bench-press/shared';
import { HttpError } from './http.ts';

const WORKFLOW_FILE = 'scrape.yml';

export interface DispatchStatus {
  requestedAt: string | null;
  cooldownUntil: string | null;
}

function cooldownUntil(requestedAt: string | null, cooldownMs: number): string | null {
  if (!requestedAt) return null;
  const until = new Date(requestedAt).getTime() + cooldownMs;
  return until > Date.now() ? new Date(until).toISOString() : null;
}

export async function dispatchStatus(
  db: Db,
  key: SettingKey,
  cooldownMs: number,
): Promise<DispatchStatus> {
  const requestedAt = await getSetting(db, key);
  return { requestedAt, cooldownUntil: cooldownUntil(requestedAt, cooldownMs) };
}

/**
 * Presses the workflow_dispatch button on GitHub. Nothing is scraped or scored in Vercel;
 * the dashboard only asks Actions to run the same workflow the cron uses.
 */
export async function dispatchWorkflow(
  db: Db,
  options: { key: SettingKey; cooldownMs: number; inputs?: Record<string, boolean> },
): Promise<{ status: DispatchStatus; started: boolean }> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO ?? 'VladislavLuchan/bench-press';
  if (!token) throw new HttpError(503, 'GITHUB_TOKEN is not configured on the dashboard');

  const current = await dispatchStatus(db, options.key, options.cooldownMs);
  if (current.cooldownUntil) return { status: current, started: false };

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
      body: JSON.stringify({ ref: 'main', inputs: options.inputs ?? {} }),
    },
  );
  if (response.status !== 204) {
    const body = await response.text().catch(() => '');
    throw new HttpError(502, `GitHub dispatch failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const requestedAt = new Date().toISOString();
  await setSetting(db, options.key, requestedAt);
  return {
    status: { requestedAt, cooldownUntil: cooldownUntil(requestedAt, options.cooldownMs) },
    started: true,
  };
}
