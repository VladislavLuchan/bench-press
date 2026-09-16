import {
  getJob,
  jobListQuerySchema,
  listJobEvents,
  listJobs,
  listPipelineJobs,
  saveCoverLetter,
  saveJobNotes,
  updateJobSchema,
  updateJobStage,
  updateJobStatus,
} from '@bench-press/shared';
import { HttpError, idParam, json, readJson } from '../lib/http.ts';
import type { Handler } from '../lib/router.ts';

export const listJobsHandler: Handler = async ({ url, db }) => {
  const query = jobListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) throw new HttpError(400, query.error.message);
  return json(await listJobs(db, query.data));
};

export const pipelineHandler: Handler = async ({ db }) => json(await listPipelineJobs(db));

/** Full job plus its change history. */
export const getJobHandler: Handler = async ({ params, db }) => {
  const id = idParam(params.id);
  const [job, events] = await Promise.all([getJob(db, id), listJobEvents(db, id)]);
  if (!job) throw new HttpError(404, 'Job not found');
  return json({ ...job, events });
};

export const updateJobHandler: Handler = async ({ request, params, db }) => {
  const id = idParam(params.id);
  const body = updateJobSchema.safeParse(await readJson(request));
  if (!body.success) throw new HttpError(400, body.error.message);

  const { status, stage, notes, coverLetter } = body.data;
  if (status) await updateJobStatus(db, id, status);
  if (stage !== undefined) await updateJobStage(db, id, stage);
  if (notes !== undefined) await saveJobNotes(db, id, notes);
  if (coverLetter !== undefined) {
    await saveCoverLetter(db, id, { text: coverLetter, lang: null, generated: false });
  }

  const [job, events] = await Promise.all([getJob(db, id), listJobEvents(db, id)]);
  if (!job) throw new HttpError(404, 'Job not found');
  return json({ ...job, events });
};
