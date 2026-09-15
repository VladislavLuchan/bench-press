import {
  getJob,
  jobListQuerySchema,
  listJobs,
  saveCoverLetter,
  updateJobSchema,
  updateJobStatus,
} from '@bench-press/shared';
import { HttpError, idParam, json, readJson } from '../lib/http.ts';
import type { Handler } from '../lib/router.ts';

export const listJobsHandler: Handler = async ({ url, db }) => {
  const query = jobListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) throw new HttpError(400, query.error.message);
  return json(await listJobs(db, query.data));
};

export const getJobHandler: Handler = async ({ params, db }) => {
  const job = await getJob(db, idParam(params.id));
  if (!job) throw new HttpError(404, 'Job not found');
  return json(job);
};

export const updateJobHandler: Handler = async ({ request, params, db }) => {
  const id = idParam(params.id);
  const body = updateJobSchema.safeParse(await readJson(request));
  if (!body.success) throw new HttpError(400, body.error.message);

  if (body.data.status) await updateJobStatus(db, id, body.data.status);
  if (body.data.coverLetter !== undefined) {
    await saveCoverLetter(db, id, { text: body.data.coverLetter, lang: null, generated: false });
  }

  const job = await getJob(db, id);
  if (!job) throw new HttpError(404, 'Job not found');
  return json(job);
};
