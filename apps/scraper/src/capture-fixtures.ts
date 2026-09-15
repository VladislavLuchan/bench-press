import { mkdir, writeFile } from 'node:fs/promises';
import type { HttpClient } from './lib/http.ts';
import { log } from './lib/logger.ts';
import { sources } from './sources/index.ts';

const FIXTURES_DIR = new URL('../tests/fixtures/', import.meta.url);

/**
 * Saves one listing page and one detail page per source as test fixtures. Runs in CI on
 * demand (see capture-fixtures.yml) so parser tests always pin the real, current markup.
 */
export async function captureFixtures(http: HttpClient): Promise<void> {
  await mkdir(FIXTURES_DIR, { recursive: true });

  for (const source of sources) {
    const listUrl = source.listingUrls[0];
    if (!listUrl) continue;

    const listBody = await http.getText(listUrl);
    const extension = listUrl.includes('feeds') ? 'xml' : 'html';
    await writeFile(new URL(`${source.name}-list.${extension}`, FIXTURES_DIR), listBody);

    const listings = source.parseListings(listBody, listUrl);
    log.info(`Captured ${source.name} listing page`, { parsed: listings.length });

    const first = listings[0];
    const detailUrl = first ? source.descriptionUrl(first) : null;
    if (!detailUrl) continue;

    const detailBody = await http.getText(detailUrl);
    await writeFile(new URL(`${source.name}-detail.html`, FIXTURES_DIR), detailBody);
    log.info(`Captured ${source.name} detail page`, {
      url: detailUrl,
      parsedChars: source.parseDescription(detailBody).length,
    });
  }
}
