# bench-press

Personal AI-assisted job aggregator for a front-end developer. Every two hours it collects
listings from several boards, drops the obvious misses with plain code, asks an LLM to score
what is left against my CV, and shows the result in a small dashboard. One click drafts a
cover letter, copies it to the clipboard and opens the listing.

**Applying is always manual.** There is no auto-apply anywhere in this codebase, and it is a
deliberate design constraint: job boards ban accounts for automated applications, and a
person should decide where to apply.

## How it works

```
GitHub Actions cron (every 2h)                     Vercel
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
   (429, login wall, empty page) puts that source on a 12 hour back-off.
2. **Dedupe** by canonical URL and by normalized `title|company`, within the run and against
   the database.
3. **Pre-filter** in code, before any LLM call. Title rules are three regexes in
   `apps/scraper/src/config/filters.ts` (must match, must not match, outsourcing ids);
   then age, listed salary and location. Filtered jobs are stored with the reason and shown
   on the dashboard's Filtered tab, so the regexes can be tuned against real misses.
4. **Insert** new jobs first, score later. If scoring fails mid-run nothing is lost; the next
   run picks up unscored rows.
5. **Describe**: fetch the full description where the listing did not include it, then
   apply description-level checks: salary below the regional floor, and location wording
   (hard "office-based / on-site only" phrases filter, softer "hub / hybrid" phrases only
   flag the job for the scorer). Short descriptions are scored but flagged.
6. **Score** in batches of five with an LLM (DeepSeek via OpenRouter by default) against the
   CV and the scoring guidance from Settings. Strict JSON validated with zod; a bad batch
   answer falls back to one request per job. Code has the last word: on-site roles are
   capped at 2, hybrid and region-limited remote at 4, off-stack roles at 4, and "nice to
   have" items are struck from the gaps. The model's raw fit is kept next to the final one.
   Token usage and an estimated cost are logged per run.
7. **Notify** on Telegram for `fit >= 7`, once per job.

Every run writes a row to `runs` with per-source counts, shown on the Stats page, so a silently
blocked source is visible within hours.

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
   `COVER_LETTER_MODEL` (default `anthropic/claude-opus-5`), `GITHUB_TOKEN` + `GITHUB_REPO`
   for the "Fetch now" button (fine-grained token, Actions: read and write).
4. Open the dashboard, enter the token, and paste your CV and cover letter template on the
   Settings page. Personal data lives only in the database, never in this repository.
5. Run the **Scrape** workflow once by hand with `backfill` checked to catch up on the last
   week; the cron takes over from there with 24 hour windows.

Tune search URLs, the salary floor and title keywords in `apps/scraper/src/config.ts`.
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

DeepSeek (through OpenRouter) scores a handful of jobs per run for fractions of a cent. Claude Opus (also through OpenRouter) writes a cover
letter only when asked, about two cents each. One key, one bill, models swappable in config. Turso, GitHub Actions and Vercel stay on free
tiers at this scale.
