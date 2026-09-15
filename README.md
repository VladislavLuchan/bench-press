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
3. **Pre-filter** in code, before any LLM call: junior/middle titles, non-front-end titles,
   listings older than 7 days, salaries clearly below the floor, on-site jobs outside Ukraine.
   Filtered jobs are stored too, so they are not re-evaluated every run.
4. **Insert** new jobs first, score later. If scoring fails mid-run nothing is lost; the next
   run picks up unscored rows.
5. **Describe**: fetch the full description where the listing did not include it.
6. **Score** each job with an LLM (DeepSeek via OpenRouter by default) against the CV.
   Strict JSON, validated with zod, retried.
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
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `LLM_API_KEY`, `DASHBOARD_TOKEN`. Optional
   `COVER_LETTER_MODEL` (default `anthropic/claude-opus-5`).
4. Open the dashboard, enter the token, and paste your CV and cover letter template on the
   Settings page. Personal data lives only in the database, never in this repository.
5. Run the **Scrape** workflow once by hand (or wait for the cron).

Tune search URLs, the salary floor and title keywords in `apps/scraper/src/config.ts`.

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
