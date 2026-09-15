import { getJob, getSetting, saveCoverLetter } from '@bench-press/shared';
import { generateCoverLetter } from '../_lib/claude.ts';
import { HttpError, idParam, json, readJson } from '../_lib/http.ts';
import { detectLanguage } from '../_lib/language.ts';
import type { Handler } from '../_lib/router.ts';

/**
 * POST /api/jobs/:id/cover-letter  { force?: boolean }
 * Returns the stored letter when one exists, otherwise generates, stores and returns it.
 */
export const coverLetterHandler: Handler = async ({ request, params, db }) => {
  const id = idParam(params.id);
  const body = (await readJson(request).catch(() => ({}))) as { force?: unknown };
  const force = body.force === true;

  const job = await getJob(db, id);
  if (!job) throw new HttpError(404, 'Job not found');
  if (job.coverLetter && !force) {
    return json({ coverLetter: job.coverLetter, lang: job.coverLetterLang, cached: true });
  }
  if (!job.description) throw new HttpError(409, 'Job has no description yet');

  const [profile, template] = await Promise.all([
    getSetting(db, 'profile'),
    getSetting(db, 'cover_letter_template'),
  ]);
  if (!profile || !template) {
    throw new HttpError(409, 'Fill in the profile and cover letter template on the Settings page');
  }

  const lang = detectLanguage(job.description);
  const coverLetter = await generateCoverLetter({
    profile,
    template,
    job: { title: job.title, company: job.company, description: job.description },
  });
  await saveCoverLetter(db, id, { text: coverLetter, lang, generated: true });
  return json({ coverLetter, lang, cached: false });
};
