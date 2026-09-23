import { describe, expect, it } from 'vitest';
import { parseLetterBrief } from '../server/lib/letter-brief.ts';
import { ensureSignature, lintLetter, templateSignature } from '../server/lib/letter-lint.ts';

const CONSTANT =
  'At Acme I led frontend on a team chat app (React, TypeScript, Electron) — sole frontend ' +
  'engineer, working with one backend dev — and set up 200+ tests from zero.';
const TEMPLATE = `[OPENING]\n\n${CONSTANT}\n\n[STORY]\n\nJane`;
const DESCRIPTION =
  'We are looking for a frontend engineer with strong commercial experience in React, ' +
  'TypeScript and Next.js to build consumer web applications for millions of players.';

const filler = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ');

function letter(...paragraphs: string[]): string {
  return [...paragraphs, CONSTANT, 'Jane'].join('\n\n');
}

describe('lintLetter', () => {
  const context = { template: TEMPLATE, description: DESCRIPTION };

  it('passes a plain letter and ignores dashes in the constant paragraph', () => {
    expect(
      lintLetter(letter(`I rebuilt a billing page in Next.js. ${filler(100)}`), context),
    ).toEqual([]);
  });

  it('still exempts the constant paragraph when the model adjusted a word of it', () => {
    const adjusted = CONSTANT.replace('sole frontend engineer', 'frontend lead');
    const text = [`Opening. ${filler(100)}`, adjusted, 'Jane'].join('\n\n');
    expect(lintLetter(text, context)).toEqual([]);
  });

  it('flags lines that restate the posting', () => {
    const problems = lintLetter(letter(`You need React — I have it. ${filler(100)}`), context);
    expect(problems.some((problem) => problem.includes('restate the posting'))).toBe(true);
  });

  it('flags dash-heavy prose, clichés and length', () => {
    const problems = lintLetter(
      letter('I am excited — really — about this. It stands out.'),
      context,
    );
    expect(problems.join('\n')).toMatch(/2 dashes/);
    expect(problems.join('\n')).toMatch(/"i am excited", "stands out"/);
    expect(problems.join('\n')).toMatch(/only \d+ words/);
  });

  it('flags wording copied from the posting once per phrase', () => {
    const problems = lintLetter(
      letter(
        `I have strong commercial experience in React, TypeScript and Next.js. ${filler(100)}`,
      ),
      context,
    );
    const copied = problems.find((problem) => problem.startsWith('Wording is copied'));
    expect(copied).toContain('"strong commercial experience in react typescript"');
    expect(copied?.match(/"/g)).toHaveLength(2);
  });
});

describe('lintLetter: what an editor would cut', () => {
  const context = { template: TEMPLATE, description: DESCRIPTION };
  const joined = (problems: string[]) => problems.join('\n');

  it('wants the constant paragraph second', () => {
    const text = [`Opening. ${filler(60)}`, `Story. ${filler(40)}`, CONSTANT, 'Jane'].join('\n\n');
    expect(joined(lintLetter(text, context))).toMatch(/move it to the second paragraph/);
  });

  it('flags two paragraphs opening with the same employer', () => {
    const text = [
      `Opening. ${filler(60)}`,
      CONSTANT,
      `At Acme, I also did more. ${filler(40)}`,
      'Jane',
    ].join('\n\n');
    expect(joined(lintLetter(text, context))).toMatch(/Two paragraphs open with "At Acme"/);
  });

  it('flags a truism opening, meta commentary and a years comparison', () => {
    const problems = joined(
      lintLetter(
        letter(
          `Fund workflows depend on interfaces that can evolve. I built a contracts editor. ${filler(60)}`,
          'That work meant agreeing on everything early. I have six years of experience rather than seven.',
        ),
        context,
      ),
    );
    expect(problems).toMatch(/opening states a general truth/);
    expect(problems).toMatch(/only comments on the sentence before it/);
    expect(problems).toMatch(/compares the candidate's years/);
  });

  it('leaves a specific opening alone', () => {
    const problems = lintLetter(
      letter(
        `Your team settles API contracts before code review; I wrote ours at Acme. ${filler(90)}`,
      ),
      context,
    );
    expect(problems).toEqual([]);
  });
});

describe('parseLetterBrief', () => {
  it('reads the brief, keeps two needs and turns "null" text into null', () => {
    const raw = `Here you go: ${JSON.stringify({
      distinctive: 'Social games for millions of players',
      opening_fact: 'Greenely web app',
      needs: [
        { need: 'React and Next.js at scale', evidence: 'Greenely web app, 70k users' },
        { need: 'Performance', evidence: 'SEO +30%' },
        { need: 'Extra', evidence: 'Extra' },
      ],
      gap: 'null',
      close_offer: 'the assistant',
    })}`;
    expect(parseLetterBrief(raw)).toEqual({
      distinctive: 'Social games for millions of players',
      openingFact: 'Greenely web app',
      needs: [
        { need: 'React and Next.js at scale', evidence: 'Greenely web app, 70k users' },
        { need: 'Performance', evidence: 'SEO +30%' },
      ],
      gap: null,
      closeOffer: 'the assistant',
    });
  });

  it('returns null for broken or incomplete output', () => {
    expect(parseLetterBrief('no json here')).toBeNull();
    expect(parseLetterBrief('{"distinctive": "x", "needs": []}')).toBeNull();
    expect(parseLetterBrief('{"distinctive": ')).toBeNull();
  });
});

describe('ensureSignature', () => {
  it('finds the signature under the blocks and puts it back when dropped', () => {
    const template =
      '# Title\n\n- Rule: keep it short.\n\n---\n\n[OPENING]\n\nA constant paragraph.\n\n[CLOSE]\n\nJane';
    expect(templateSignature(template)).toBe('Jane');
    expect(ensureSignature('Body text.', template)).toBe('Body text.\n\nJane');
    expect(ensureSignature('Body text.\n\nJane', template)).toBe('Body text.\n\nJane');
  });

  it('adds nothing when the template ends with a block or a paragraph', () => {
    expect(templateSignature('[OPENING]\n\n[CLOSE]')).toBeNull();
    expect(ensureSignature('Body.', '[CLOSE]')).toBe('Body.');
  });
});
