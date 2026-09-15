import * as cheerio from 'cheerio';

const BLOCK_SELECTOR =
  'p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, tr, section, article, blockquote';

/** Converts an HTML fragment to readable plain text, keeping paragraph and list breaks. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html, null, false);
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  $('li').prepend('- ');
  $(BLOCK_SELECTOR).each((_, element) => {
    $(element).append('\n');
  });
  return normalizeWhitespace($.root().text());
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
