import { coverLetterHandler } from './_handlers/cover-letter.ts';
import { getJobHandler, listJobsHandler, updateJobHandler } from './_handlers/jobs.ts';
import {
  getSettingsHandler,
  runsHandler,
  statsHandler,
  updateSettingsHandler,
} from './_handlers/misc.ts';
import { createRouter, route } from './_lib/router.ts';

/**
 * Single Vercel function for the whole API. vercel.json rewrites /api/* here, which keeps
 * one bundle, one cold start and one place to enforce the auth token.
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
