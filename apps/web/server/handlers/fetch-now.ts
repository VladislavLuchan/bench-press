import { json } from '../lib/http.ts';
import { dispatchStatus, dispatchWorkflow } from '../lib/github.ts';
import type { Handler } from '../lib/router.ts';

/** Minimum gap between manual runs; the cron already runs every two hours. */
const FETCH_COOLDOWN_MS = 20 * 60 * 1000;
/** A rescore touches every open job; once an hour is plenty. */
const RESCORE_COOLDOWN_MS = 60 * 60 * 1000;

export const fetchStatusHandler: Handler = async ({ db }) =>
  json(await dispatchStatus(db, 'fetch_requested_at', FETCH_COOLDOWN_MS));

export const fetchNowHandler: Handler = async ({ db }) => {
  const result = await dispatchWorkflow(db, {
    key: 'fetch_requested_at',
    cooldownMs: FETCH_COOLDOWN_MS,
  });
  return json({ ...result.status, started: result.started });
};

export const rescoreStatusHandler: Handler = async ({ db }) =>
  json(await dispatchStatus(db, 'rescore_requested_at', RESCORE_COOLDOWN_MS));

export const rescoreHandler: Handler = async ({ db }) => {
  const result = await dispatchWorkflow(db, {
    key: 'rescore_requested_at',
    cooldownMs: RESCORE_COOLDOWN_MS,
    inputs: { rescore: true },
  });
  return json({ ...result.status, started: result.started });
};
