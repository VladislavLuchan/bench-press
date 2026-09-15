import { coverLetterHandler } from './handlers/cover-letter.ts';
import { getJobHandler, listJobsHandler, updateJobHandler } from './handlers/jobs.ts';
import {
  getSettingsHandler,
  runsHandler,
  statsHandler,
  updateSettingsHandler,
} from './handlers/misc.ts';
import { createRouter, route } from './lib/router.ts';

/**
 * Single Vercel function for the whole API. vercel.json rewrites /api/* here, which keeps
 * one bundle, one cold start and one place to enforce the auth token.
 * Built by scripts/build-api.mjs into api/index.js; the api/ directory holds only that output.
 */
const handle = createRouter([
  route('GET', /^\/jobs$/, listJobsHandler),
  route('GET', /^\/jobs\/(?<id>\d+)$/, getJobHandler),
  route('PATCH', /^\/jobs\/(?<id>\d+)$/, updateJobHandler),
  route('POST', /^\/jobs\/(?<id>\d+)\/cover-letter$/, coverLetterHandler),
  route('GET', /^\/stats$/, statsHandler),
  route('GET', /^\/runs$/, runsHandler),
  route('GET', /^\/settings$/, getSettingsHandler),
  route('PUT', /^\/settings$/, updateSettingsHandler),
]);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
