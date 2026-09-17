import {
  exportQuerySchema,
  listEventsForJobs,
  listJobsFull,
  listPipelineJobsFull,
} from '@bench-press/shared';
import { formatJsonl, formatMarkdown, type ExportMeta } from '../lib/export.ts';
import { HttpError, textFile } from '../lib/http.ts';
import type { Handler } from '../lib/router.ts';

const NON_FILTER_PARAMS = new Set(['scope', 'format', 'description', 'limit']);

/**
 * GET /api/export?scope=jobs|pipeline&format=md|jsonl&description=0|1 plus the list filters.
 * Returns a file; the dashboard either downloads it or copies the Markdown to the clipboard.
 */
export const exportHandler: Handler = async ({ url, db }) => {
  const query = exportQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) throw new HttpError(400, query.error.message);
  const { scope, format, description, ...filters } = query.data;

  const jobs =
    scope === 'pipeline' ? await listPipelineJobsFull(db) : await listJobsFull(db, filters);
  const events = await listEventsForJobs(
    db,
    jobs.map((job) => job.id),
  );
  const withEvents = jobs.map((job) => ({ ...job, events: events.get(job.id) ?? [] }));

  const exportedAt = new Date().toISOString();
  const meta: ExportMeta = {
    scope,
    exportedAt,
    filters:
      scope === 'pipeline'
        ? []
        : [...url.searchParams]
            .filter(([key]) => !NON_FILTER_PARAMS.has(key))
            .map(([key, value]) => `${key}=${value}`),
    includeDescription: description,
  };

  const filename = `bench-press-${scope}-${exportedAt.slice(0, 10)}.${format}`;
  return format === 'jsonl'
    ? textFile(formatJsonl(withEvents, meta), { contentType: 'application/x-ndjson', filename })
    : textFile(formatMarkdown(withEvents, meta), { contentType: 'text/markdown', filename });
};
