import type { Db } from '@bench-press/shared';
import { isAuthorized } from './auth.ts';
import { getDb } from './db.ts';
import { HttpError, json } from './http.ts';

export interface RequestContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  db: Db;
}

export type Handler = (context: RequestContext) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

/** Tiny path router. All API traffic is rewritten to one function (see vercel.json). */
export function createRouter(routes: Route[]) {
  return async function handle(request: Request): Promise<Response> {
    try {
      if (!isAuthorized(request)) throw new HttpError(401, 'Unauthorized');

      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
      const route = routes.find(
        (candidate) => candidate.method === request.method && candidate.pattern.test(path),
      );
      if (!route) throw new HttpError(404, `No route for ${request.method} ${path}`);

      const match = path.match(route.pattern);
      const params = { ...(match?.groups ?? {}) };
      return await route.handler({ request, url, params, db: await getDb() });
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: 'Internal error' }, 500);
    }
  };
}

export function route(method: string, pattern: RegExp, handler: Handler): Route {
  return { method, pattern, handler };
}
