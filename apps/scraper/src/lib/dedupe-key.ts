/**
 * Secondary dedupe key: the same opening is often posted on several boards with slightly
 * different formatting, so compare a normalized `title|company` pair.
 */
export function dedupeKey(title: string, company: string | null): string {
  return `${normalizeText(title)}|${normalizeText(company ?? '')}`;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
