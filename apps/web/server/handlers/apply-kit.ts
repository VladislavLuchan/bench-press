import { getJob, getSetting } from '@bench-press/shared';
import { letterFilename, letterHeader, parseApplyFields } from '../lib/apply-fields.ts';
import { renderCoverLetterPdf } from '../lib/cover-letter-pdf.ts';
import { letterFonts } from '../lib/fonts.ts';
import { binaryFile, HttpError, idParam, json, readJson } from '../lib/http.ts';
import { generateAnswer } from '../lib/llm.ts';
import type { Handler } from '../lib/router.ts';

// Tools for filling an employer's application form by hand: the browser extension and the
// dashboard read saved answers, download the letter as a document and draft answers to
// custom questions. Nothing here submits anything anywhere.

/** GET /api/apply-fields: the saved form answers, parsed into label/value pairs. */
export const applyFieldsHandler: Handler = async ({ db }) => {
  const fields = parseApplyFields((await getSetting(db, 'apply_fields')) ?? '');
  return json({ fields, header: letterHeader(fields) });
};

/** GET /api/jobs/:id/cover-letter.pdf: the stored letter as an A4 document. */
export const coverLetterPdfHandler: Handler = async ({ params, db }) => {
  const id = idParam(params.id);
  const job = await getJob(db, id);
  if (!job) throw new HttpError(404, 'Job not found');
  if (!job.coverLetter) throw new HttpError(409, 'Generate the cover letter first');

  const header = letterHeader(parseApplyFields((await getSetting(db, 'apply_fields')) ?? ''));
  const date = new Date().toLocaleDateString(job.coverLetterLang === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const pdf = await renderCoverLetterPdf({ text: job.coverLetter, header, date }, letterFonts);
  return binaryFile(pdf, {
    contentType: 'application/pdf',
    filename: letterFilename(header.name, job.company),
  });
};

/** POST /api/jobs/:id/answer { question }: a draft answer to one question from a form. */
export const answerHandler: Handler = async ({ request, params, db }) => {
  const id = idParam(params.id);
  const body = (await readJson(request)) as { question?: unknown };
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) throw new HttpError(400, 'question is required');
  if (question.length > 2000) throw new HttpError(400, 'question is too long');

  const job = await getJob(db, id);
  if (!job) throw new HttpError(404, 'Job not found');
  const [profile, facts] = await Promise.all([
    getSetting(db, 'profile'),
    getSetting(db, 'apply_fields'),
  ]);
  if (!profile) throw new HttpError(409, 'Fill in the profile on the Settings page');

  const answer = await generateAnswer({
    profile,
    facts: facts ?? '',
    question,
    job: { title: job.title, company: job.company, description: job.description },
  });
  return json({ answer });
};
