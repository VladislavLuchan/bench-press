/** Rough script check: enough Cyrillic letters means the listing is in Ukrainian. */
export function detectLanguage(text: string): 'uk' | 'en' {
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  return cyrillic > 0 && cyrillic / (cyrillic + latin) > 0.3 ? 'uk' : 'en';
}
