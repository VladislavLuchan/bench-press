// Legal forms that make one employer look like two across boards: "Patrianna" on LinkedIn,
// "Patrianna Limited" on DOU.
const LEGAL_SUFFIXES = new Set([
  'ag',
  'bv',
  'co',
  'corp',
  'corporation',
  'gmbh',
  'inc',
  'limited',
  'llc',
  'ltd',
  'o',
  'ou',
  'oü',
  'plc',
  'sa',
  'sp',
  'srl',
  'tov',
  'z',
]);

/**
 * Secondary dedupe key: the same opening is often posted on several boards with slightly
 * different formatting, so compare a normalized `title|company` pair.
 */
export function dedupeKey(title: string, company: string | null): string {
  return `${normalizeText(title)}|${normalizeCompany(company ?? '')}`;
}

function normalizeCompany(value: string): string {
  const words = normalizeText(value).split(' ').filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.join(' ');
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
