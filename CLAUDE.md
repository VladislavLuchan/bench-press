# bench-press — notes for Claude

Personal job aggregator: a scraper on GitHub Actions scores listings with an LLM, a React
dashboard on Vercel shows them. Read `README.md` for architecture; this file holds only the
rules and traps that are not visible in the code.

## Hard rules

- **Never run project code on the developer's machines.** No `npm install`, `npm test`,
  `npm run *`, `tsx`, `vite`, dev servers or scripts. Verify through CI and Vercel only.
  Reading files, `git`, `gh` and `curl` against the deployed API are fine.
- **Never build auto-apply** in any form, not even as an option. Applying is manual.
  The extension may fill a field or attach a file only when the user presses a button in its
  panel. It never clicks, submits, navigates or acts on its own.
- **Scrapers never log in or send cookies.** One User-Agent, pauses between requests to the
  same host, back off on 429 or a login redirect instead of retrying.
- **GitHub account is `VladislavLuchan`.** The machine usually has `v-luchan-snotor` active
  for work. Switch only for the push, then switch back:
  `gh auth switch --user VladislavLuchan && git push; gh auth switch --user v-luchan-snotor`.
  For `gh run` / `gh workflow` use `GH_TOKEN=$(gh auth token --user VladislavLuchan)` instead.
- Code, comments and commits in English. Talk to the user in Ukrainian.
- Personal data (CV, cover letter template, application form answers) lives only in the
  database `settings` table.

## Working loop without local execution

1. Edit, commit, push. `ci.yml` runs typecheck, lint, tests, build, then `prettier --check`.
2. A formatting-only CI failure is expected: dispatch **Maintenance** (`maintenance.yml`),
   which runs Prettier, refreshes `package-lock.json` and commits. Bot commits do not trigger
   CI, so dispatch `ci.yml` afterwards.
3. **Always `git pull --rebase` after Maintenance before editing again.** Prettier rewraps
   lines, so exact-string replacements written against the old text silently miss.
   After scripted edits, grep for the new code before committing.
4. Read failures with `gh run view <id> --log-failed`.
5. Vercel deploys `main` automatically; confirm by fetching the new JS asset or hitting
   `/api/*` with the dashboard token.

Other workflows: **Scrape** (`scrape.yml`, cron every 2h; inputs `dry_run`, `backfill`,
`rescore`), **Capture fixtures** (saves live pages into `apps/scraper/tests/fixtures`, then
fix parsers until tests pass).

## Where things are

- `packages/shared` — types, zod schemas, all SQL (`src/db/*`), OpenAI-compatible LLM client.
  Schema changes: add a guarded entry to `COLUMN_MIGRATIONS` in `src/db/schema.ts`; never
  edit existing CREATE statements. Migrations run at scraper start.
- `apps/scraper/src/config.ts` — search queries, limits, scoring model (OpenRouter id).
- `apps/scraper/src/config/filters.ts` — title and location regexes; tests in
  `tests/config/*`.
- `apps/scraper/src/prompts/score.md` — scoring prompt. `pipeline/score.ts` post-validates
  the model output (location and stack caps, optional gaps); keep code as the final word.
- `apps/web/server` — API source, one router behind a bearer token.
- `apps/web/src` — dashboard, BEM CSS, no UI library, hotkeys in `hooks/useHotkeys.ts`.
- `apps/extension` — Chrome MV3 extension, plain JS without a build, loaded unpacked. Talks to
  the dashboard through `src/dashboard-bridge.js` (window.postMessage) and to the API with the
  token it reads from the dashboard. Pure matching logic in `src/page/match.js` is tested.

## Traps already hit

- Vercel needs `apps/web/api/index.js` committed; it re-exports `server-dist/index.js`,
  which `npm run build` bundles with esbuild. Vercel does not rewrite `.ts` imports.
- Browser code imports only `@bench-press/shared/types`. The package root pulls in libsql.
- Use an `https://` Turso URL; `libsql://` opens a websocket that breaks in serverless.
- `window.open` and clipboard writes must run synchronously inside the click or keydown.
- Tabs opened from a popup window (`window.open` with `popup=yes`) land in the main browser
  window, not the popup. That is why job windows are created by the extension as normal
  windows; the popup stays only as the fallback without the extension.
- Hotkeys match `event.code`, so they work in any keyboard layout. Vimium users add the site
  to "Excluded URLs and keys"; do not steal focus to bypass it.
- Rescore re-evaluates only `new` jobs with a description. `applied`, `replied` and
  `skipped` are never touched; `filtered` rows have no description to rescore.
- Every status, stage and note change is written to `job_events`.
- Fit is "can I take this job", not "dream job". The LLM reports facts; every bonus, penalty
  and cap lives in `postValidate`. Company type and `dream` must never feed into fit.
- Djinni `exp_level` matches the exact number of years, and unknown `primary_keyword` values
  return every job on the site. Valid: JavaScript, React.js, Fullstack, Node.js.
- JS `\b` does not see Cyrillic letters; use `\p{L}` lookarounds or a character-range test.

## Secrets

GitHub Actions: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LLM_API_KEY` (OpenRouter),
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, optional `PROXY_URL`; variable `DASHBOARD_URL`.
Vercel: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LLM_API_KEY`, `DASHBOARD_TOKEN`, optional
`COVER_LETTER_MODEL`, `GITHUB_TOKEN`, `GITHUB_REPO`. Never commit values.
