import { describe, expect, it } from 'vitest';
import { companyKey } from '../src/lib/company.ts';

describe('companyKey', () => {
  it('drops legal forms so one employer groups together', () => {
    expect(companyKey('Patrianna Limited')).toBe(companyKey('Patrianna'));
    expect(companyKey('Acme, Inc.')).toBe('acme');
    expect(companyKey('Foo Sp. z o.o.')).toBe('foo');
    expect(companyKey('ТОВ Бар')).toBe('тов бар');
  });

  it('keeps names that are only a suffix-like word', () => {
    expect(companyKey('Limited')).toBe('limited');
  });

  it('returns null for a missing or empty name', () => {
    expect(companyKey(null)).toBeNull();
    expect(companyKey(' - ')).toBeNull();
  });
});
