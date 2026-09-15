import { mkdir, writeFile } from 'node:fs/promises';
import type { HttpClient } from './lib/http.ts';
import { log } from './lib/logger.ts';
import { sources } from './sources/index.ts';

const FIXTURES_DIR = new URL('../tests/fixtures/', import.meta.url);

function extensionFor(source: string, url: string): string {
  if (source === 'nofluffjobs') return 'json';
  return url.includes('feeds') ? 'xml' : 'html';
}

/**
 * Saves the first page of the first search and one detail page per source as test fixtures.
 * Runs in CI on demand (see capture-fixtures.yml) so parser tests pin the real markup.
 */
export async function captureFixtures(http: HttpClient): Promise<void> {
  await mkdir(FIXTURES_DIR, { recursive: true });

  for (const source of sources) {
    const search = source.searches({ backfill: false })[0];
    if (!search) continue;
    const { url, init } = search.request(0);

    const listBody = await http.request(url, init);
    await writeFile(new URL(`${source.name}-list.${extensionFor(source.name, url)}`, FIXTURES_DIR), listBody);

    const listings = source.parseListings(listBody, url);
    log.info(`Captured ${source.name} listing page`, { parsed: listings.length });

    const first = listings[0];
    const detailUrl = first ? source.descriptionUrl(first) : null;
    if (!detailUrl) continue;

    const detailBody = await http.getText(detailUrl);
    const extension = source.name === 'nofluffjobs' ? 'json' : 'html';
    await writeFile(new URL(`${source.name}-detail.${extension}`, FIXTURES_DIR), detailBody);
    log.info(`Captured ${source.name} detail page`, {
      url: detailUrl,
      parsedChars: source.parseDescription(detailBody).length,
    });
  }
}
