import {
  getAllSettings,
  getDashboardStats,
  listRuns,
  setSetting,
  settingsUpdateSchema,
  SETTING_KEYS,
} from '@bench-press/shared';
import { HttpError, json, readJson } from '../lib/http.ts';
import type { Handler } from '../lib/router.ts';

export const statsHandler: Handler = async ({ db }) => json(await getDashboardStats(db));

export const runsHandler: Handler = async ({ db }) => json(await listRuns(db, 20));

export const getSettingsHandler: Handler = async ({ db }) => {
  const settings = await getAllSettings(db);
  return json(Object.fromEntries(SETTING_KEYS.map((key) => [key, settings[key] ?? ''])));
};

export const updateSettingsHandler: Handler = async ({ request, db }) => {
  const body = settingsUpdateSchema.safeParse(await readJson(request));
  if (!body.success) throw new HttpError(400, body.error.message);
  for (const key of SETTING_KEYS) {
    const value = body.data[key];
    if (value !== undefined) await setSetting(db, key, value);
  }
  return getSettingsHandler({ request, db, url: new URL(request.url), params: {} });
};
