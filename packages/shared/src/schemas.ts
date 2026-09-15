import { z } from 'zod';
import { JOB_STATUSES, SETTING_KEYS, SOURCE_NAMES } from './types.ts';

export const sourceNameSchema = z.enum(SOURCE_NAMES);
export const jobStatusSchema = z.enum(JOB_STATUSES);
export const settingKeySchema = z.enum(SETTING_KEYS);

/** Contract for the scoring LLM output. Kept strict so malformed answers are retried, not stored. */
export const scoreResultSchema = z.object({
  fit: z.number().int().min(1).max(10),
  summary: z.string().trim().min(1),
  matches: z.array(z.string()),
  gaps: z.array(z.string()),
  red_flags: z.array(z.string()),
  salary: z.string().nullable(),
  remote: z.boolean(),
  seniority: z.string(),
});

export const jobListQuerySchema = z.object({
  minFit: z.coerce.number().int().min(0).max(10).optional(),
  source: sourceNameSchema.optional(),
  status: jobStatusSchema.optional(),
  /** ISO date (YYYY-MM-DD); only jobs first seen on or after this day. */
  since: z.iso.date().optional(),
  sort: z.enum(['fit', 'date']).default('fit'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;

/** PATCH /api/jobs/:id body. `filtered` is scraper-owned and cannot be set from the dashboard. */
export const updateJobSchema = z
  .object({
    status: jobStatusSchema.exclude(['filtered']).optional(),
    coverLetter: z.string().optional(),
  })
  .refine((body) => body.status !== undefined || body.coverLetter !== undefined, {
    message: 'Provide status or coverLetter',
  });
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const settingsUpdateSchema = z.partialRecord(settingKeySchema, z.string());
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
