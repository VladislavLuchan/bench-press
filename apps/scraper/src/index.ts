import { captureFixtures } from './capture-fixtures.ts';
import { readEnv } from './env.ts';
import { createHttpClient } from './lib/http.ts';
import { errorMessage, log } from './lib/logger.ts';
import { runPipeline } from './pipeline/run.ts';

const USAGE = `Usage: scrape [--dry-run] [--capture-fixtures]
  --dry-run           Fetch and filter, print what would be stored; no DB, LLM or Telegram.
  --capture-fixtures  Save one listing and one detail page per source into tests/fixtures.`;

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help')) {
    console.log(USAGE);
    return;
  }

  const http = createHttpClient();
  if (args.has('--capture-fixtures')) {
    await captureFixtures(http);
    return;
  }

  const dryRun = args.has('--dry-run');
  await runPipeline({ http, env: dryRun ? null : readEnv(), dryRun });
}

main().catch((error: unknown) => {
  log.error('Scraper failed', { error: errorMessage(error) });
  process.exitCode = 1;
});
