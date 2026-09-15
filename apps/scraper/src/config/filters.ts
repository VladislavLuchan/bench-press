/**
 * Title filters applied before any LLM call. Tune these regexes, not the pipeline.
 * A title must match TITLE_INCLUDE and must not match TITLE_EXCLUDE or TITLE_OUTSOURCE_ID.
 * Rejected titles are stored with status `filtered` and the reason, so misses are visible
 * on the dashboard's Filtered tab.
 */

export const TITLE_INCLUDE =
  /\b(react|typescript|type script|frontend|front-end|front end|fullstack|full-stack|full stack|electron|next\.?js|node(\.js)?|web engineer|ui engineer|product engineer|javascript|js)\b/i;

// `.net`, `c#` and `c++` sit outside the word-boundary group: `\b` does not work next to punctuation.
export const TITLE_EXCLUDE =
  /\.net\b|\bdotnet\b|c#|c\+\+|\b(designer|ux|python|django|java|kotlin|angular|vue|nuxt|svelte|shopify|wordpress|webflow|php|laravel|ruby|rails|golang|go|rust|webgpu|webgl|three\.?js|pixi|unity|unreal|qa\b|test engineer|test automation|aqa|devops|sre|data engineer|ml engineer|manager|recruiter|junior|middle|intern|trainee|student|ai training|annotat|react native|mobile|ios|android|flutter|scada|roku|html coder|coder\b|джуніор|стажер|верстальник)\b/i;

/** Outsourcing companies tag listings with request ids; those are bulk postings, not roles. */
export const TITLE_OUTSOURCE_ID = /\b(IRC|REQ|JR|ID)[-_ ]?\d{4,}\b/;

export type TitleVerdict = { ok: true } | { ok: false; reason: string };

export function checkTitle(title: string): TitleVerdict {
  const excluded = title.match(TITLE_EXCLUDE);
  if (excluded) return { ok: false, reason: `title: excluded "${excluded[0].toLowerCase()}"` };
  const outsource = title.match(TITLE_OUTSOURCE_ID);
  if (outsource) return { ok: false, reason: `title: outsourcing id "${outsource[0]}"` };
  if (!TITLE_INCLUDE.test(title)) return { ok: false, reason: 'title: not a front-end role' };
  return { ok: true };
}

/** Description-level filters, applied after the full text is fetched. */
export const DESCRIPTION_FILTERS = {
  /** Explicit salary in the description below this is skipped. USD/EUR treated alike. */
  salaryFloorUsd: { ua: 3500, eu: 4000 },
  /** Office-only wording that disqualifies unless remote is also mentioned. */
  officeOnly: /\b(office[- ]only|on-?site only|no remote|not remote|relocation (is )?required|тільки офіс|без віддаленої|офіс(ний)? формат)\b/i,
  remoteMention: /\b(remote|hybrid|віддалено|дистанційно|гібрид)\b/i,
  /** Descriptions shorter than this are scored but flagged as thin. */
  thinDescriptionChars: 300,
  /** Signals that the employer is Ukrainian, which selects the lower salary floor. */
  ukraineSignal: /\b(ukraine|україн|київ|kyiv|львів|lviv|харків|kharkiv|дніпро|dnipro|одеса|odesa)\b/i,
} as const;
