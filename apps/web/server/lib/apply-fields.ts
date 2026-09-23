/** One answer the user types into application forms again and again. */
export interface ApplyField {
  label: string;
  value: string;
}

// "Label: value". The label cannot contain a slash, so a URL on its own line ("https://...")
// is never mistaken for a new field.
const FIELD_LINE = /^([^\s:/#][^:/]{0,59}):[ \t]*(.*)$/;
const URL_LINE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Parses the `apply_fields` setting: one `Label: value` per line. A line that does not
 * start a field continues the previous value, which is how multi-line answers are written;
 * indent a continuation line that itself contains a colon. Lines starting with `#` are
 * comments.
 */
export function parseApplyFields(text: string): ApplyField[] {
  const fields: ApplyField[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.trimStart().startsWith('#')) continue;
    const match = URL_LINE.test(line) ? null : FIELD_LINE.exec(line);
    if (match) {
      fields.push({ label: match[1]!.trim(), value: match[2]!.trim() });
      continue;
    }
    const last = fields[fields.length - 1];
    if (last) last.value = last.value ? `${last.value}\n${line.trim()}` : line.trim();
  }
  return fields
    .map((field) => ({ ...field, value: field.value.replace(/\n+$/, '').trim() }))
    .filter((field) => field.label && field.value);
}

function find(fields: ApplyField[], pattern: RegExp): string | null {
  return fields.find((field) => pattern.test(field.label))?.value ?? null;
}

export interface LetterHeader {
  name: string | null;
  /** Email, phone and profile links, in that order, for the line under the name. */
  contacts: string[];
}

/** Name and contact line for the top of the cover letter document. */
export function letterHeader(fields: ApplyField[]): LetterHeader {
  const first = find(fields, /^first\s*name$|^ім'?я$/i);
  const last = find(fields, /^(last\s*name|surname|family\s*name|прізвище)$/i);
  const name =
    find(fields, /^(full\s*)?name$|^повне ім'?я$/i) ??
    ([first, last].filter(Boolean).join(' ') || null);
  const contacts = [
    find(fields, /e-?mail|пошта/i),
    find(fields, /phone|mobile|телефон/i),
    find(fields, /linkedin/i),
    find(fields, /github/i),
    find(fields, /website|portfolio|сайт/i),
  ].filter((value): value is string => Boolean(value));
  return { name, contacts };
}

/** File name the employer sees, e.g. `Jane_Doe_Cover_Letter_Acme.pdf`. */
export function letterFilename(name: string | null, company: string | null): string {
  const part = (value: string) =>
    value
      // Accents come off Latin letters only; й and ї stay whole.
      .normalize('NFKD')
      .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '');
  return [name && part(name), 'Cover_Letter', company && part(company)]
    .filter(Boolean)
    .join('_')
    .concat('.pdf');
}
