import { describe, expect, it } from 'vitest';
import { checkLocation } from '../../src/config/filters.ts';

/** Phrases seen in real postings. `hard` blocks, `soft` only flags, `none` passes. */
const CASES: Array<[phrase: string, expected: 'hard' | 'soft' | 'none']> = [
  ['This role can be based in our tech hub in Tallinn or Helsinki.', 'soft'],
  ['We work hybrid: three days in the Warsaw office.', 'soft'],
  ['Preferably located in Berlin, remote possible within Germany.', 'soft'],
  ['We are open to candidates willing to relocate to Amsterdam.', 'soft'],
  ['Relocation package available for the right candidate.', 'soft'],
  ['This is an office-based position in Kyiv.', 'hard'],
  ['On-site only, no remote work.', 'hard'],
  ['You must be based in Poland and work from our office.', 'hard'],
  ['Office attendance is mandatory.', 'hard'],
  ['3 days per week in the office.', 'hard'],
  ['2 days a week at the office, the rest from home.', 'hard'],
  ['Not remote. Relocation is required.', 'hard'],
  ['In-office role in our Lisbon HQ.', 'hard'],
  ['Fully remote, work from anywhere in Europe.', 'none'],
  ['100% remote; we have a hybrid option in Stockholm for those who want it.', 'none'],
  ['Remote-first team, office attendance is mandatory only for the yearly offsite.', 'none'],
  ['Remote within the EU. Our tech hub is in Copenhagen.', 'none'],
  ['Remote friendly company with an office in Oslo.', 'none'],
  ['We are hiring a Senior React Developer for a fintech product.', 'none'],
  ['Location: Ukraine, remote.', 'none'],
];

describe('checkLocation', () => {
  it.each(CASES)('%s', (phrase, expected) => {
    expect(checkLocation(phrase).flag).toBe(expected);
  });

  it('reports the phrase that triggered the verdict', () => {
    expect(checkLocation('Office attendance is mandatory.').match).toBe('Office attendance is mandatory');
    expect(checkLocation('can be based in our tech hub in Tallinn').match).toBe('can be based in');
    expect(checkLocation('fully remote').match).toBeNull();
  });
});
