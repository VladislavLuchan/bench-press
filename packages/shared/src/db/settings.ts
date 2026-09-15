import { nowIso, type Db } from './client.ts';
import { textRequired } from './row.ts';
import type { SettingKey } from '../types.ts';

export async function getSetting(db: Db, key: SettingKey): Promise<string | null> {
  const result = await db.execute({ sql: `SELECT value FROM settings WHERE key = ?`, args: [key] });
  const row = result.rows[0];
  return row ? textRequired(row, 'value') : null;
}

export async function getAllSettings(db: Db): Promise<Partial<Record<SettingKey, string>>> {
  const result = await db.execute(`SELECT key, value FROM settings`);
  const settings: Partial<Record<SettingKey, string>> = {};
  for (const row of result.rows) {
    settings[textRequired(row, 'key') as SettingKey] = textRequired(row, 'value');
  }
  return settings;
}

export async function setSetting(db: Db, key: SettingKey, value: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, value, nowIso()],
  });
}
