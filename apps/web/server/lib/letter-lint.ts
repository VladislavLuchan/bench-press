// Checks a written cover letter in code, the way post-validation checks scores: the model is
// asked to fix exactly what is listed here (step 3 in llm.ts). Paragraphs taken from the
// template (the constant paragraph, even lightly adjusted, and the signature) are the user's
// own words and are never checked.

const MAX_WORDS = 210;
const MIN_WORDS = 90;
const MAX_DASHES = 1;
/** A run of this many words shared with the posting counts as copying its wording. */
const COPIED_RUN = 6;
/** Share of a paragraph's word runs found in the template that makes it the template's. */
const TEMPLATE_SHARE = 0.6;
const MAX_COPIED_REPORTS = 2;

const CLICHES = [
  'i am excited',
  "i'm excited",
  'i am thrilled',
  "i'm thrilled",
  'passionate',
  'perfect fit',
  'great fit',
  'stands out',
  'leverage',
  'fast-paced',
  'look forward',
  'looking forward',
  'hit the ground running',
  'thank you for your time',
  'thank you for considering',
  'not just',
  'dynamic team',
  'i believe i would',
];

const RESTATING = /^(you need|you're looking for|you are looking for|your posting|as (your|the) posting)/i;

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
}

function runs(tokens: string[], size: number): string[] {
  const result: string[] = [];
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.push(tokens.slice(index, index + size).join(' '));
  }
  return result;
}

function isFromTemplate(paragraph: string, template: string, templateRuns: Set<string>): boolean {
  if (template.includes(paragraph)) return true;
  const own = runs(words(paragraph), COPIED_RUN);
  if (own.length === 0) return false;
  return own.filter((run) => templateRuns.has(run)).length / own.length >= TEMPLATE_SHARE;
}

export interface LetterContext {
  /** The template from Settings; its literal paragraphs are exempt from the checks. */
  template: string;
  description: string;
}

/** Problems a reader would notice, phrased as instructions for the revision step. */
export function lintLetter(letter: string, context: LetterContext): string[] {
  const problems: string[] = [];
  const total = words(letter).length;
  if (total > MAX_WORDS) problems.push(`It is ${total} words; cut it to under 200.`);
  if (total < MIN_WORDS) problems.push(`It is only ${total} words; aim for 130 to 200.`);

  const templateRuns = new Set(runs(words(context.template), COPIED_RUN));
  const own = letter
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !isFromTemplate(paragraph, context.template, templateRuns));
  const text = own.join('\n');

  const restating = text.split('\n').filter((line) => RESTATING.test(line.trim()));
  if (restating.length > 0) {
    problems.push(
      `Lines restate the posting ("${restating[0]!.trim().slice(0, 40)}…"). Rewrite them as ` +
        'what the candidate did and what came of it, without "You need".',
    );
  }

  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes > MAX_DASHES) {
    problems.push(
      `${dashes} dashes (—) outside the constant paragraph read as machine-written; keep at ` +
        'most one and use periods or commas instead.',
    );
  }

  const lower = text.toLowerCase();
  const cliches = CLICHES.filter((phrase) => lower.includes(phrase));
  if (cliches.length > 0) {
    problems.push(`Remove the clichés: ${cliches.map((phrase) => `"${phrase}"`).join(', ')}.`);
  }

  const posting = new Set(runs(words(context.description), COPIED_RUN));
  const copied: string[] = [];
  for (const run of runs(words(text), COPIED_RUN)) {
    if (!posting.has(run)) continue;
    // Overlapping runs of one copied phrase are reported once.
    if (copied.some((phrase) => phrase.includes(run.split(' ').slice(0, 3).join(' ')))) continue;
    copied.push(run);
    if (copied.length === MAX_COPIED_REPORTS) break;
  }
  if (copied.length > 0) {
    problems.push(
      `Wording is copied from the posting (${copied.map((run) => `"${run}"`).join(', ')}); say ` +
        'it in the candidate’s own words or drop it.',
    );
  }
  return problems;
}
