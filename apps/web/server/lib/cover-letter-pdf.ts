import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import type { LetterHeader } from './apply-fields.ts';

export interface LetterFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

export interface LetterDocument {
  text: string;
  header: LetterHeader;
  /** Printed under the contacts, e.g. "23 September 2026". */
  date: string;
}

// A4 in points, with margins that suit a one-page letter.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 64;
const BODY_SIZE = 11;
const BODY_LEADING = 16;
const PARAGRAPH_GAP = 8;
const NAME_SIZE = 18;
const SMALL_SIZE = 9.5;
const TEXT_COLOR = rgb(0.1, 0.1, 0.12);
const MUTED_COLOR = rgb(0.38, 0.4, 0.44);

/**
 * Breaks one paragraph into lines no wider than `maxWidth`. A single word wider than the
 * line (a long URL) gets a line of its own rather than being cut.
 */
export function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Drops characters the font cannot draw (emoji, rare symbols) instead of failing. */
function drawable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text]
    .filter((char) => char === '\n' || supported.has(char.codePointAt(0) ?? 0))
    .join('');
}

/** Renders the letter as a one- or multi-page A4 PDF with the name and contacts on top. */
export async function renderCoverLetterPdf(
  letter: LetterDocument,
  fonts: LetterFonts,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const title = letter.header.name ? `${letter.header.name} — Cover letter` : 'Cover letter';
  pdf.setTitle(drawable(regular, title));
  if (letter.header.name) pdf.setAuthor(drawable(regular, letter.header.name));

  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const line = (text: string, font: PDFFont, size: number, leading: number, color = TEXT_COLOR) => {
    if (y - leading < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= leading;
    page.drawText(text, { x: MARGIN, y, size, font, color });
  };

  if (letter.header.name) line(drawable(bold, letter.header.name), bold, NAME_SIZE, NAME_SIZE);
  const measureSmall = (text: string) => regular.widthOfTextAtSize(text, SMALL_SIZE);
  const contacts = drawable(regular, letter.header.contacts.join('  ·  '));
  for (const text of wrapParagraph(contacts, maxWidth, measureSmall)) {
    line(text, regular, SMALL_SIZE, SMALL_SIZE + 5, MUTED_COLOR);
  }
  line(drawable(regular, letter.date), regular, SMALL_SIZE, SMALL_SIZE + 5, MUTED_COLOR);
  y -= BODY_LEADING;

  const measure = (text: string) => regular.widthOfTextAtSize(text, BODY_SIZE);
  const paragraphs = drawable(regular, letter.text)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) y -= PARAGRAPH_GAP;
    // Single line breaks inside a paragraph are kept: sign-offs are written that way.
    for (const row of paragraph.split('\n')) {
      for (const text of wrapParagraph(row, maxWidth, measure)) {
        line(text, regular, BODY_SIZE, BODY_LEADING);
      }
    }
  });

  return pdf.save();
}
