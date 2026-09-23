import { answerHandler, applyFieldsHandler, coverLetterPdfHandler } from './handlers/apply-kit.ts';
import { coverLetterHandler } from './handlers/cover-letter.ts';
import { exportHandler } from './handlers/export.ts';
import {
  fetchNowHandler,
  fetchStatusHandler,
  rescoreHandler,
  rescoreStatusHandler,
} from './handlers/fetch-now.ts';
import {
  getJobHandler,
  listJobsHandler,
  pipelineHandler,
  updateJobHandler,
} from './handlers/jobs.ts';
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
 * Bundled by scripts/build-api.mjs into server-dist/index.js and re-exported by api/index.js.
 */
const handle = createRouter([
  route('GET', /^\/jobs$/, listJobsHandler),
  route('GET', /^\/pipeline$/, pipelineHandler),
  route('GET', /^\/export$/, exportHandler),
  route('GET', /^\/jobs\/(?<id>\d+)$/, getJobHandler),
  route('PATCH', /^\/jobs\/(?<id>\d+)$/, updateJobHandler),
  route('POST', /^\/jobs\/(?<id>\d+)\/cover-letter$/, coverLetterHandler),
  route('GET', /^\/jobs\/(?<id>\d+)\/cover-letter\.pdf$/, coverLetterPdfHandler),
  route('POST', /^\/jobs\/(?<id>\d+)\/answer$/, answerHandler),
  route('GET', /^\/apply-fields$/, applyFieldsHandler),
  route('GET', /^\/stats$/, statsHandler),
  route('GET', /^\/runs$/, runsHandler),
  route('GET', /^\/settings$/, getSettingsHandler),
  route('PUT', /^\/settings$/, updateSettingsHandler),
  route('GET', /^\/fetch-now$/, fetchStatusHandler),
  route('POST', /^\/fetch-now$/, fetchNowHandler),
  route('GET', /^\/rescore$/, rescoreStatusHandler),
  route('POST', /^\/rescore$/, rescoreHandler),
]);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
