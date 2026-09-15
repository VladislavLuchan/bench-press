import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Single-user bearer token check. The dashboard is personal; the token only keeps the
 * Vercel URL from being an open door to the database. Hashing before comparison keeps the
 * comparison constant-time regardless of token length.
 */
export function isAuthorized(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.DASHBOARD_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return timingSafeEqual(digest(token), digest(expected));
}
