import type { RoleType } from '@bench-press/shared';

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
  /\.net\b|\bdotnet\b|c#|c\+\+|\b(designer|ux|python|django|java|kotlin|angular|vue|nuxt|svelte|shopify|wordpress|webflow|php|laravel|ruby|rails|golang|go|rust|webgpu|webgl|three\.?js|pixi|unity|unreal|qa\b|test engineer|test automation|aqa|devops|sre|data engineer|ml engineer|manager|recruiter|junior|middle|mid[- ]?level|mid|talent pool|intern|trainee|student|ai training|annotat\w*|react native|mobile|ios|android|flutter|scada|roku|html coder|coder\b|джуніор|стажер|верстальник)\b/i;

/** Outsourcing companies tag listings with request ids; those are bulk postings, not roles. */
export const TITLE_OUTSOURCE_ID = /\b(IRC|REQ|JR|ID)[-_ ]?\d{4,}\b/;

/**
 * Titles written in a language the candidate does not work in. Gender markers such as
 * (m/w/d) and H/F are the German and French conventions; (m/f/d) is left alone because
 * German companies use it on English-language postings.
 */
export const TITLE_FOREIGN_LANGUAGE =
  /\((?:m\/w\/d|w\/m\/d|m\/w\/x|w\/m\/x|h\/f|f\/h)\)|\b[hf]\/[hf]\b|\b(d[ée]veloppeu(?:r|se)|ing[ée]nieur|entwickler(?:in)?|softwareentwickler|werkstudent|stagiaire|alternance|desarrollador|programador|sviluppatore|programista|ontwikkelaar|utvecklare|utvikler|udvikler)\b/i;

export type TitleVerdict = { ok: true } | { ok: false; reason: string };

/** Role breadth from the title alone: staff-level first, then fullstack, otherwise frontend. */
export function roleTypeOf(title: string): RoleType {
  if (/\b(staff|principal|architect)\b/i.test(title)) return 'staff';
  if (/full[- ]?stack/i.test(title)) return 'fullstack';
  return 'frontend';
}

export function checkTitle(title: string): TitleVerdict {
  const foreign = title.match(TITLE_FOREIGN_LANGUAGE);
  if (foreign) return { ok: false, reason: `language: "${foreign[0].toLowerCase()}"` };
  const excluded = title.match(TITLE_EXCLUDE);
  if (excluded) return { ok: false, reason: `title: excluded "${excluded[0].toLowerCase()}"` };
  const outsource = title.match(TITLE_OUTSOURCE_ID);
  if (outsource) return { ok: false, reason: `title: outsourcing id "${outsource[0]}"` };
  if (!TITLE_INCLUDE.test(title)) return { ok: false, reason: 'title: not a front-end role' };
  return { ok: true };
}

/**
 * Location rules, checked on title + location + description. Kept deliberately loose:
 * a doubtful listing should reach the LLM rather than disappear into `filtered`.
 */
export const LOCATION_HARD_NO =
  /\b(office[- ]based|on[- ]site only|onsite only|in[- ]office|office attendance (is )?(mandatory|required)|must be (located|based) in|no remote|not remote|relocation (is )?required|work from (our )?office|\d+ days? (a|per) week (in|at) (the )?office|тільки офіс|без віддаленої роботи)\b/i;

export const LOCATION_SOFT =
  /\b(hybrid|can be based in|based in our (office|hub)|tech hub|relocat\w*|willing to relocate|preferably (located|based) in|гібрид\w*)\b/i;

export const LOCATION_REMOTE =
  /\b(fully remote|100% remote|remote[- ]first|remote (within|from) (the )?(eu|europe|ukraine|anywhere)|work from anywhere|remote ok|remote friendly|повністю віддалено|віддалено з будь-якої)\b/i;

export type LocationFlag = 'hard' | 'soft' | 'none';

export interface LocationVerdict {
  flag: LocationFlag;
  /** The phrase that triggered the verdict, for review on the Filtered tab. */
  match: string | null;
}

/** HARD_NO without a remote phrase blocks; SOFT without a remote phrase only flags. */
export function checkLocation(text: string): LocationVerdict {
  const remote = LOCATION_REMOTE.test(text);
  const hard = text.match(LOCATION_HARD_NO);
  if (hard && !remote) return { flag: 'hard', match: hard[0] };
  const soft = text.match(LOCATION_SOFT);
  if (soft && !remote) return { flag: 'soft', match: soft[0] };
  return { flag: 'none', match: null };
}

/** Description-level filters, applied after the full text is fetched. */
export const DESCRIPTION_FILTERS = {
  /** Explicit salary in the description below this is skipped. USD/EUR treated alike. */
  salaryFloorUsd: { ua: 3500, eu: 4000 },
  /** Descriptions shorter than this are scored but flagged as thin. */
  thinDescriptionChars: 300,
  /** Signals that the employer is Ukrainian, which selects the lower salary floor. */
  // Latin names only: `\b` does not work with Cyrillic, which is handled separately below.
  ukraineSignal: /\b(ukraine|kyiv|kiev|lviv|kharkiv|dnipro|odesa|odessa|uzhhorod)\b/i,
} as const;

/** Description wording that makes a country in the location field irrelevant. */
export const REMOTE_ANYWHERE =
  /remote (from )?(anywhere|worldwide|eu|europe|european union|ukraine)|work from anywhere|eu[- ]wide/i;

/** Location values that name a region rather than one country, or nothing at all. */
const BROAD_LOCATION =
  /^(remote|worldwide|anywhere|global|emea|eu|europe|european union|european economic area|countries of europe or ukraine|europe or ukraine|віддалено|дистанційно)?$/i;

/** Ukraine by name, or any location written in Cyrillic (Ukrainian boards list cities that way). */
export function isUkrainianPlace(place: string): boolean {
  return DESCRIPTION_FILTERS.ukraineSignal.test(place) || /[\u0400-\u04ff]/.test(place);
}

/**
 * True when the listing names one specific country other than Ukraine and the description
 * never says remote work from elsewhere is fine. Such "remote" roles usually require
 * residency, so the scorer treats them as region-limited.
 */
export function residencyLikely(location: string | null, description: string | null): boolean {
  const place = (location ?? '').trim();
  if (BROAD_LOCATION.test(place)) return false;
  if (isUkrainianPlace(place)) return false;
  // "Warsaw, Poland (Remote)" is still one country; strip decorations before judging breadth.
  const bare = place.replace(/\(.*?\)/g, '').trim();
  if (BROAD_LOCATION.test(bare)) return false;
  return !REMOTE_ANYWHERE.test(description ?? '');
}
