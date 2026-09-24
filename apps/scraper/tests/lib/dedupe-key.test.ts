import { describe, expect, it } from 'vitest';
import { dedupeKey } from '../../src/lib/dedupe-key.ts';

describe('dedupeKey', () => {
  it('ignores case, punctuation and parenthesised suffixes', () => {
    expect(dedupeKey('Senior Front-End Developer (React)', 'ACME Inc.')).toBe(
      dedupeKey('senior front end developer', 'acme inc'),
    );
  });

  it('ignores legal forms, so boards that spell the employer differently still match', () => {
    expect(dedupeKey('Senior Frontend Engineer', 'Patrianna Limited')).toBe(
      dedupeKey('Senior Frontend Engineer', 'Patrianna'),
    );
    expect(dedupeKey('Frontend Developer', 'Acme Sp. z o.o.')).toBe(
      dedupeKey('Frontend Developer', 'ACME'),
    );
    expect(dedupeKey('Frontend Developer', 'Limited')).toBe('frontend developer|limited');
  });

  it('distinguishes different companies', () => {
    expect(dedupeKey('Frontend Developer', 'A')).not.toBe(dedupeKey('Frontend Developer', 'B'));
  });

  it('tolerates a missing company', () => {
    expect(dedupeKey('Frontend Developer', null)).toBe('frontend developer|');
  });
});
