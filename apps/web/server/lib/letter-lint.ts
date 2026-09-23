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

/** A template paragraph this long is the constant block, not the signature. */
const CONSTANT_MIN_CHARS = 60;
// The first sentence states a general truth about their product instead of a fact.
const TRUISM =
  /\b(depends? on|relies on|rely on|requires|hinges on|comes down to|is all about|means balancing|needs? (?:to|a|an|interfaces|teams))\b/i;
// A sentence that comments on the previous one instead of adding a fact.
const META =
  /^(that|this) (work|experience|project|role|background|job)\b[^.]*\b(meant|means|gave|taught|showed|helped me|made me)\b/i;
// Comparing the candidate's years with the posting's, in English or Ukrainian.
const YEARS_SHORTFALL =
  /\b(years?|yrs)\b[^.]*\b(rather than|instead of|less than|fewer than|short of|than the (listed|required))\b|(рок(ів|и)[^.]*(замість|менше))/i;
// "At Acme Labs, I…" and "At Acme I led…" both name Acme; the pronoun is not part of it.
const EMPLOYER_OPENING = /^At ([\p{Lu}][\p{L}\p{N}&.-]*(?: (?!I\b)[\p{Lu}][\p{L}\p{N}&.-]*)*)/u;

const RESTATING =
  /^(you need|you're looking for|you are looking for|your posting|as (your|the) posting)/i;

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
  const paragraphs = letter
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const fromTemplate = paragraphs.map((paragraph) =>
    isFromTemplate(paragraph, context.template, templateRuns),
  );
  const own = paragraphs.filter((_, index) => !fromTemplate[index]);
  const text = own.join('\n');
  const sentences = own.flatMap((paragraph) =>
    paragraph.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()),
  );

  const constantAt = paragraphs.findIndex(
    (paragraph, index) => fromTemplate[index] && paragraph.length >= CONSTANT_MIN_CHARS,
  );
  if (constantAt > 1) {
    problems.push(
      `The constant paragraph ("${paragraphs[constantAt]!.slice(0, 30)}…") must come right ` +
        'after the opening; move it to the second paragraph.',
    );
  }

  const openings = paragraphs.map((paragraph) => EMPLOYER_OPENING.exec(paragraph)?.[1] ?? null);
  const repeated = openings.find(
    (name, index) => name !== null && openings.indexOf(name) !== index,
  );
  if (repeated) {
    problems.push(
      `Two paragraphs open with "At ${repeated}"; merge them or open the second one differently.`,
    );
  }

  const first = sentences[0];
  if (first && TRUISM.test(first)) {
    problems.push(
      `The opening states a general truth ("${first.slice(0, 60)}…"). Open with something ` +
        'only this posting says and the candidate fact that answers it.',
    );
  }

  const meta = sentences.filter((sentence) => META.test(sentence));
  if (meta.length > 0) {
    problems.push(
      `"${meta[0]!.slice(0, 50)}…" only comments on the sentence before it; delete it or ` +
        'replace it with a result.',
    );
  }

  const years = sentences.filter((sentence) => YEARS_SHORTFALL.test(sentence));
  if (years.length > 0) {
    problems.push(
      `"${years[0]!.slice(0, 50)}…" compares the candidate's years with the posting's. ` +
        'Never mention it; delete the sentence.',
    );
  }

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
