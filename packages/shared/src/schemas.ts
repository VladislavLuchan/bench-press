import { z } from 'zod';
import {
  COMPANY_TYPES,
  JOB_STAGES,
  JOB_STATUSES,
  LOCATION_TYPES,
  SETTING_KEYS,
  SOURCE_NAMES,
} from './types.ts';

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
  primary_stack: z.string().trim().toLowerCase().default('other'),
  location_type: z.enum(LOCATION_TYPES).catch('unclear'),
  // Facts for code post-validation. Lenient defaults: a missing flag must never sink a job.
  company_type: z.enum(COMPANY_TYPES).catch('unknown'),
  frontend_focused: z.boolean().catch(true),
  backend_heavy: z.boolean().catch(false),
  years_required: z.number().nullable().catch(null),
  other_language_required: z.string().nullable().catch(null),
  has_project_description: z.boolean().catch(true),
  dream_signals: z.array(z.string()).catch([]),
});
export const scoreResultListSchema = z.array(scoreResultSchema);

export const jobListQuerySchema = z.object({
  minFit: z.coerce.number().int().min(0).max(10).optional(),
  source: sourceNameSchema.optional(),
  status: jobStatusSchema.optional(),
  /** ISO date (YYYY-MM-DD); only jobs first seen on or after this day. */
  since: z.iso.date().optional(),
  /** Comma-separated location types; `unscored` includes jobs without a verdict yet. */
  locationType: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : undefined)),
  /** Comma-separated role types (frontend, fullstack, staff). */
  roleType: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : undefined)),
  /** Comma-separated company types; `unscored` includes jobs without a verdict yet. */
  companyType: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : undefined)),
  dream: z
    .enum(['0', '1'])
    .optional()
    .transform((value) => value === '1'),
  sort: z.enum(['fit', 'date']).default('fit'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;

/** GET /api/export: the list filters plus what to export and in which format. */
export const exportQuerySchema = jobListQuerySchema.extend({
  /** `jobs` exports the filtered list; `pipeline` exports everything applied to. */
  scope: z.enum(['jobs', 'pipeline']).default('jobs'),
  /** `md` for pasting into an LLM, `jsonl` for scripts. */
  format: z.enum(['md', 'jsonl']).default('md'),
  /** Full descriptions multiply the size; off unless asked for. */
  description: z
    .enum(['0', '1'])
    .default('0')
    .transform((value) => value === '1'),
  limit: z.coerce.number().int().min(1).max(2000).default(1000),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;

/** PATCH /api/jobs/:id body. `filtered` is scraper-owned and cannot be set from the dashboard. */
export const jobStageSchema = z.enum(JOB_STAGES);

export const updateJobSchema = z
  .object({
    status: jobStatusSchema.exclude(['filtered']).optional(),
    /** Pipeline column; null moves the job back to the Applied column. */
    stage: jobStageSchema.nullable().optional(),
    notes: z.string().max(20_000).optional(),
    coverLetter: z.string().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Provide status, stage, notes or coverLetter',
  });
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const settingsUpdateSchema = z.partialRecord(settingKeySchema, z.string());
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
