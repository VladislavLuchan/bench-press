// Legal-form words that make one employer look like two ("Patrianna" vs "Patrianna Limited").
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

/** Grouping key for a company name, or null when the name is missing. */
export function companyKey(company: string | null): string | null {
  if (!company) return null;
  const words = company
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  return words.length > 0 ? words.join(' ') : null;
}
