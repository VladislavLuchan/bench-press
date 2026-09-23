import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderCoverLetterPdf, wrapParagraph } from '../server/lib/cover-letter-pdf.ts';

const font = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../server/fonts/${name}`, import.meta.url)));
const fonts = { regular: font('NotoSans-Regular.ttf'), bold: font('NotoSans-Bold.ttf') };

describe('wrapParagraph', () => {
  const measure = (text: string) => text.length;

  it('fills lines up to the width', () => {
    expect(wrapParagraph('aa bb cc dd', 5, measure)).toEqual(['aa bb', 'cc dd']);
  });

  it('keeps an over-long word on its own line', () => {
    expect(wrapParagraph('a https://example.com/long b', 5, measure)).toEqual([
      'a',
      'https://example.com/long',
      'b',
    ]);
  });

  it('returns nothing for an empty paragraph', () => {
    expect(wrapParagraph('   ', 5, measure)).toEqual([]);
  });
});

describe('renderCoverLetterPdf', () => {
  it('renders Latin and Cyrillic text and drops glyphs the font lacks', async () => {
    const bytes = await renderCoverLetterPdf(
      {
        text: 'Dear team,\n\nПривіт, це тест. 🚀 Long line '.concat('word '.repeat(400)),
        header: { name: 'Олена Коваль', contacts: ['olena@example.com', '+380 00 000 0000'] },
        date: '23 вересня 2026 р.',
      },
      fonts,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    // Subsetting keeps the file small enough for any upload field.
    expect(bytes.length).toBeLessThan(200_000);
  });
});
