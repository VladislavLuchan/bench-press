import { createHash } from 'node:crypto';

/**
 * Fingerprint of a description, ignoring case, punctuation and whitespace. Two listings of
 * one company with the same fingerprint are the same opening posted under different titles.
 */
export function descriptionHash(description: string): string {
  const normalized = description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 4000);
  return createHash('sha1').update(normalized).digest('hex');
}
