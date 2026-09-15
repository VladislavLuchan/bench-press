const TRACKING_PARAM = /^(utm_|ref$|refid$|trackingid$|trk$|position$|pagenum$|from$|src$)/i;

/**
 * Canonical form of a job URL, used as the primary dedupe key. Strips tracking
 * parameters, fragments and trailing slashes; LinkedIn URLs collapse to the numeric id.
 */
export function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }

  if (url.hostname.endsWith('linkedin.com')) {
    const id = linkedinJobId(url.pathname);
    if (id) return `https://www.linkedin.com/jobs/view/${id}`;
  }

  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

/** Extracts the numeric posting id from a LinkedIn job URL path, if present. */
export function linkedinJobId(pathname: string): string | null {
  const match = pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})\/?$/);
  return match?.[1] ?? null;
}
