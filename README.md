# bench-press

Personal AI-assisted job aggregator. Collects front-end job listings from several boards,
scores each one against my CV with an LLM, shows them in a dashboard, and drafts a cover
letter on demand. Applying is always done by hand: there is no auto-apply, by design.

Work in progress. Architecture and setup notes will land here as the pieces come together.

## Layout

- `apps/scraper` - Node/TypeScript scraper, runs on a GitHub Actions cron.
- `apps/web` - React dashboard plus Vercel serverless API.
- `packages/shared` - types, validation schemas and database access shared by both.
