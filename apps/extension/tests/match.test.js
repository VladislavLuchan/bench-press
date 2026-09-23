import { beforeAll, describe, expect, it } from 'vitest';

let match;
beforeAll(async () => {
  // A classic script: it registers itself on globalThis instead of exporting.
  await import('../src/page/match.js');
  match = globalThis.benchPressMatch;
});

const FIELDS = [
  { label: 'First name', value: 'Jane' },
  { label: 'Last name', value: 'Doe' },
  { label: 'Email', value: 'jane@example.com' },
  { label: 'Phone', value: '+380000000000' },
  { label: 'LinkedIn', value: 'https://linkedin.com/in/jane' },
  { label: 'Salary expectations', value: '5000 USD' },
  { label: 'How did you hear about us?', value: 'LinkedIn' },
];

describe('kindOf', () => {
  it('recognises common labels in any spelling', () => {
    expect(match.kindOf('First Name *')).toBe('first_name');
    expect(match.kindOf('first_name')).toBe('first_name');
    expect(match.kindOf('firstName')).toBe('first_name');
    expect(match.kindOf('Surname')).toBe('last_name');
    expect(match.kindOf('Name')).toBe('full_name');
    expect(match.kindOf('E-mail address')).toBe('email');
    expect(match.kindOf('LinkedIn Profile')).toBe('linkedin');
    expect(match.kindOf('Where are you based?')).toBe('location');
    expect(match.kindOf('Country of residence')).toBe('country');
    expect(match.kindOf('Desired salary')).toBe('salary');
  });

  it('reads Ukrainian labels', () => {
    expect(match.kindOf("Ім'я")).toBe('first_name');
    expect(match.kindOf('Прізвище')).toBe('last_name');
    expect(match.kindOf('Телефон')).toBe('phone');
  });

  it('leaves unknown questions alone', () => {
    expect(match.kindOf('Tell us about a project you are proud of')).toBeNull();
    expect(match.kindOf('')).toBeNull();
  });
});

describe('valueForField', () => {
  it('trusts the label over a misleading placeholder', () => {
    expect(match.valueForField(['Email', 'name@example.com'], 'text', null, FIELDS)).toBe(
      'jane@example.com',
    );
  });

  it('uses the input type and autocomplete token', () => {
    expect(match.valueForField([], 'email', null, FIELDS)).toBe('jane@example.com');
    expect(match.valueForField([], 'text', 'section-x given-name', FIELDS)).toBe('Jane');
  });

  it('composes and splits names', () => {
    expect(match.valueForField(['Full name'], 'text', null, FIELDS)).toBe('Jane Doe');
    const onlyFull = [{ label: 'Full name', value: 'Jane Q Doe' }];
    expect(match.valueForField(['First name'], 'text', null, onlyFull)).toBe('Jane');
    expect(match.valueForField(['Last name'], 'text', null, onlyFull)).toBe('Q Doe');
  });

  it('matches a custom question saved word for word', () => {
    expect(
      match.valueForField(['How did you hear about us? *'], 'text', null, FIELDS),
    ).toBe('LinkedIn');
  });

  it('returns null when nothing fits', () => {
    expect(match.valueForField(['GitHub'], 'text', null, FIELDS)).toBeNull();
  });
});

describe('uploadKind', () => {
  it('tells the cover letter upload from the resume upload', () => {
    expect(match.uploadKind(['Cover Letter', 'cover_letter'])).toBe('cover_letter');
    expect(match.uploadKind(['Resume/CV', 'resume'])).toBe('resume');
    expect(match.uploadKind(['Résumé'])).toBe('resume');
    expect(match.uploadKind(['Мотиваційний лист'])).toBe('cover_letter');
    expect(match.uploadKind(['Attachments'])).toBeNull();
  });
});
