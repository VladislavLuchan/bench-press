import { describe, expect, it } from 'vitest';
import { splitTitle } from '../../src/sources/dou.ts';

describe('splitTitle', () => {
  it('splits position, company and locations', () => {
    expect(splitTitle('Senior Front-end Developer в SoftServe, Київ, віддалено')).toEqual({
      title: 'Senior Front-end Developer',
      company: 'SoftServe',
      location: 'Київ, віддалено',
    });
  });

  it('handles a company without locations', () => {
    expect(splitTitle('React Developer в Acme')).toEqual({
      title: 'React Developer',
      company: 'Acme',
      location: null,
    });
  });

  it('returns the raw title when the pattern does not match', () => {
    expect(splitTitle('Frontend Developer')).toEqual({
      title: 'Frontend Developer',
      company: null,
      location: null,
    });
  });
});
