export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Plain-text response offered as a download with the given file name. */
export function textFile(
  body: string,
  options: { contentType: string; filename: string },
): Response {
  return new Response(body, {
    headers: {
      'Content-Type': `${options.contentType}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${options.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON');
  }
}

export function idParam(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid id');
  return id;
}
