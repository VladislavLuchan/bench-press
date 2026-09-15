type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, data?: Record<string, unknown>): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;
  const out = level === 'info' ? console.log : console.error;
  out(data ? `${line} ${JSON.stringify(data)}` : line);
}

export const log = {
  info: (message: string, data?: Record<string, unknown>) => write('info', message, data),
  warn: (message: string, data?: Record<string, unknown>) => write('warn', message, data),
  error: (message: string, data?: Record<string, unknown>) => write('error', message, data),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
