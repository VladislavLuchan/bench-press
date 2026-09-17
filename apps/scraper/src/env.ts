export interface ScraperEnv {
  tursoUrl: string;
  tursoAuthToken: string | undefined;
  llmApiKey: string;
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
  dashboardUrl: string | undefined;
  /** BACKFILL=1 widens source date windows to a week for a first catch-up run. */
  backfill: boolean;
  /** RESCORE_LOCATION_TYPE narrows a rescore run to jobs with that location type. */
  rescoreLocationType: string | undefined;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

/** Reads and validates secrets. Telegram is optional: without it, notifications are skipped. */
export function readEnv(env: NodeJS.ProcessEnv = process.env): ScraperEnv {
  return {
    tursoUrl: required(env, 'TURSO_DATABASE_URL'),
    tursoAuthToken: env.TURSO_AUTH_TOKEN,
    llmApiKey: required(env, 'LLM_API_KEY'),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    dashboardUrl: env.DASHBOARD_URL,
    backfill: env.BACKFILL === '1' || env.BACKFILL === 'true',
    rescoreLocationType: env.RESCORE_LOCATION_TYPE || undefined,
  };
}
