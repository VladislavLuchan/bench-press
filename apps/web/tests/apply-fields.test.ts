import { describe, expect, it } from 'vitest';
import { letterFilename, letterHeader, parseApplyFields } from '../server/lib/apply-fields.ts';

const SAMPLE = `# Basics
First name: Jane
Last name: Doe
Email: jane@example.com
Phone: +380 00 000 0000
LinkedIn: https://www.linkedin.com/in/jane
Why remote:
I ship better with long focus blocks.
  Timezone: I overlap with CET fully.
Notice period: 2 weeks
Empty:
`;

describe('parseApplyFields', () => {
  it('reads label/value lines, multi-line values and skips comments', () => {
    expect(parseApplyFields(SAMPLE)).toEqual([
      { label: 'First name', value: 'Jane' },
      { label: 'Last name', value: 'Doe' },
      { label: 'Email', value: 'jane@example.com' },
      { label: 'Phone', value: '+380 00 000 0000' },
      { label: 'LinkedIn', value: 'https://www.linkedin.com/in/jane' },
      {
        label: 'Why remote',
        value: 'I ship better with long focus blocks.\nTimezone: I overlap with CET fully.',
      },
      { label: 'Notice period', value: '2 weeks' },
    ]);
  });

  it('treats a bare URL line as a continuation, not a field', () => {
    expect(parseApplyFields('Portfolio:\nhttps://jane.dev')).toEqual([
      { label: 'Portfolio', value: 'https://jane.dev' },
    ]);
  });

  it('reads Ukrainian labels', () => {
    expect(parseApplyFields("Ім'я: Олена")).toEqual([{ label: "Ім'я", value: 'Олена' }]);
  });
});

describe('letterHeader', () => {
  it('joins first and last name and collects contacts in order', () => {
    expect(letterHeader(parseApplyFields(SAMPLE))).toEqual({
      name: 'Jane Doe',
      contacts: ['jane@example.com', '+380 00 000 0000', 'https://www.linkedin.com/in/jane'],
    });
  });

  it('prefers a full name field and survives no fields', () => {
    expect(letterHeader(parseApplyFields('Full name: Jane Q. Doe')).name).toBe('Jane Q. Doe');
    expect(letterHeader([])).toEqual({ name: null, contacts: [] });
  });
});

describe('letterFilename', () => {
  it('builds a safe name from the person and the company', () => {
    expect(letterFilename('Jane Doe', 'Café & Co.')).toBe('Jane_Doe_Cover_Letter_Cafe_Co.pdf');
    expect(letterFilename('Андрій Їжак', null)).toBe('Андрій_Їжак_Cover_Letter.pdf');
    expect(letterFilename(null, null)).toBe('Cover_Letter.pdf');
  });
});
