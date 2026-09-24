# bench-press

Personal AI-assisted job aggregator for a front-end developer. Every hour or two it collects
listings from several boards, drops the obvious misses with plain code, asks an LLM to score
what is left against my CV, and shows the result in a small dashboard. One click drafts a
cover letter, copies it to the clipboard and opens the listing.

**Applying is always manual.** There is no auto-apply anywhere in this codebase, and it is a
deliberate design constraint: job boards ban accounts for automated applications, and a
person should decide where to apply.

The optional browser extension (`apps/extension`) opens a job in its own window and puts a
side panel next to the employer's form: saved answers to copy or fill, the cover letter as a
PDF for the upload field, and draft answers to custom questions. It fills a field only when
you press a button and never submits a form.

## How it works

```
GitHub Actions cron (hourly)                       Vercel
┌──────────────────────────────────────┐          ┌───────────────────────────┐
│ apps/scraper                          │          │ apps/web                  │
│  Djinni ─┐                            │          │  React dashboard (Vite)   │
│  LinkedIn ├─ fetch → dedupe → prefilter│──Turso──│  /api/* (one function)    │
│  DOU ────┘        ↓                   │  (SQLite)│   list / status / stats   │
│           describe → score (LLM)      │          │   cover letter (LLM)      │
│                     ↓                 │          └───────────────────────────┘
│              Telegram (fit ≥ 7)       │
└──────────────────────────────────────┘
```

Pipeline, in order:

1. **Fetch** all sources in parallel. A failing source never stops the others. A block signal
   (429, login wall, empty page) puts that source on a 12 hour back-off (LinkedIn: 3 hours,
   since every run starts on a new runner IP). LinkedIn is fetched at most every 2 hours.
2. **Dedupe** by canonical URL and by normalized `title|company`, within the run and against
   the database.
3. **Pre-filter** in code, before any LLM call. Title rules are three regexes in
   `apps/scraper/src/config/filters.ts` (must match, must not match, outsourcing ids);
   then age, listed salary and location. Filtered jobs are stored with the reason and shown
   on the dashboard's Filtered tab, so the regexes can be tuned against real misses.
   The same stage drops blacklisted companies (`config/company-blacklist.ts`), titles in other
   languages, cards asking for under three years, and reposts of one description by one company.
4. **Insert** new jobs first, score later. If scoring fails mid-run nothing is lost; the next
   run picks up unscored rows.
5. **Describe**: fetch the full description where the listing did not include it, then
   apply description-level checks: salary below the regional floor, and location wording
   (hard "office-based / on-site only" phrases filter, softer "hub / hybrid" phrases only
   flag the job for the scorer). Short descriptions are scored but flagged.
6. **Score** in batches of five with an LLM (DeepSeek V4.1 Flash via OpenRouter by default) against the
   CV and the scoring guidance from Settings. Strict JSON validated with zod; a bad batch
   answer falls back to one request per job. Code has the last word: on-site roles are
   capped at 2, hybrid and region-limited remote at 4, off-stack roles at 4, and "nice to
   have" items are struck from the gaps. The model's raw fit is kept next to the final one.
   Fit means "does the job suit me and can I take it". The model reports facts (company type,
   front-end focus, required years and languages) and code applies every penalty and cap once.
   Company type and the dream flag are shown as badges and never change the fit.
   Token usage and an estimated cost are logged per run.
7. **Notify** on Telegram for `fit >= 7`, once per job.

Every run writes a row to `runs` with per-source counts, shown on the Stats page, so a silently
blocked source is visible within hours.

After applying, a job moves through the **Pipeline** board: Applied → Replied → Rejected /
Advancing → HR interview → Tech interview → Offer. Every status or stage change is written to
`job_events`, so nothing about an application is ever lost.

## Sources

| Source   | How                                                | Description    |
| -------- | -------------------------------------------------- | -------------- |
| Djinni   | Public listing pages, no login                     | inline in list |
| LinkedIn | Guest search endpoint, no cookies or session, ever | guest posting  |
| DOU      | Official RSS feed                                  | inline in feed |

A source is a small module: a list of URLs plus pure parse functions. Fetching is shared, so
parsers are tested against saved HTML fixtures and a markup change fails CI instead of
silently returning nothing. `.github/workflows/capture-fixtures.yml` refreshes the fixtures.

## Layout

```
apps/scraper      Node 24, TypeScript, fetch + cheerio. Run by scrape.yml.
apps/web          React + Vite dashboard and the Vercel API function.
apps/extension   Chrome extension (plain JS, loaded unpacked): job windows, form helper.
packages/shared   Types, zod schemas, schema.sql-as-code, libsql queries.
```

No ORM, no UI library, no framework on the API side. SQL is written by hand against
`@libsql/client`; the dashboard is React with BEM-style CSS.

## Setup

1. **Turso**: create a database, note the `https://` URL and an auth token. The scraper
   creates the tables on first run.
2. **GitHub Secrets** (Settings → Secrets and variables → Actions):
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LLM_API_KEY` (OpenRouter), `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID`. Optional: `PROXY_URL` (residential proxy, used through Node's
   `NODE_USE_ENV_PROXY`). Variable: `DASHBOARD_URL` for links in Telegram messages.
3. **Vercel**: import the repo, set Root Directory to `apps/web`, add env vars
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LLM_API_KEY`, `DASHBOARD_TOKEN`. Optional:
   `COVER_LETTER_MODEL` (default `openai/gpt-6-luna`), `GITHUB_TOKEN` + `GITHUB_REPO`
   for the "Fetch now" button (fine-grained token, Actions: read and write).
4. Open the dashboard, enter the token, and paste your CV, cover letter template and
   application form answers on the Settings page. Personal data lives only in the database,
   never in this repository.
5. Optional: load `apps/extension` unpacked in Chrome (see its README).
6. Run the **Scrape** workflow once by hand with `backfill` checked to catch up on the last
   week; the cron takes over from there with 24 hour windows.

Tune search URLs, the salary floor and title keywords in `apps/scraper/src/config.ts`.
To feed results to an LLM, use **Export** on the Jobs or Pipeline page: "Copy for LLM" puts
compact Markdown on the clipboard, `.md` and `.jsonl` download files. The same data is
available from `GET /api/export?scope=jobs|pipeline&format=md|jsonl&description=0|1` with the
list filters and the dashboard token.

After changing filters or the prompt, run the **Scrape** workflow with `rescore` checked (or
press "Rescore all" on the Settings page) to re-evaluate every open job.

## Development

This project is developed and verified entirely in CI: `ci.yml` runs type checks, lint,
tests, the Vite build and a formatting check on every push. Two helper workflows exist
because nothing runs on the development machine:

- **Maintenance**: resolves `package-lock.json`, runs Prettier, commits.
- **Capture fixtures**: saves one live page per source into `apps/scraper/tests/fixtures`.

Locally the usual commands still work: `npm install`, `npm test`, `npm run typecheck`,
`npm run scrape -w @bench-press/scraper -- --dry-run` (fetch and filter, print, touch nothing).

## Costs

DeepSeek (through OpenRouter) scores a handful of jobs per run for fractions of a cent. GPT-6
Luna (also through OpenRouter) writes a cover letter or a form answer only when asked, well
under a cent each. One key, one bill, models swappable in config. Turso, GitHub Actions and Vercel stay on free
tiers at this scale.
