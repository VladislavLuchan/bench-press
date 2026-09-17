import { describe, expect, it } from 'vitest';
import { isBlacklistedCompany } from '../../src/config/company-blacklist.ts';
import { descriptionHash } from '../../src/lib/description-hash.ts';

describe('descriptionHash', () => {
  it('ignores case, punctuation and whitespace', () => {
    expect(descriptionHash('We build  React apps.\n- TypeScript!')).toBe(
      descriptionHash('we build react apps - typescript'),
    );
  });

  it('differs for different text', () => {
    expect(descriptionHash('React role at Acme')).not.toBe(descriptionHash('Vue role at Acme'));
  });
});

describe('isBlacklistedCompany', () => {
  it('matches the start of the name, case-insensitively', () => {
    expect(isBlacklistedCompany('Quik Hire Staffing')).toBe(true);
    expect(isBlacklistedCompany('HIRE FEED LLC')).toBe(true);
    expect(isBlacklistedCompany('Jobgether')).toBe(true);
    expect(isBlacklistedCompany('Wolt')).toBe(false);
    expect(isBlacklistedCompany(null)).toBe(false);
  });
});
