import { describe, expect, it } from 'vitest';
import { parseLetterBrief } from '../server/lib/letter-brief.ts';
import { lintLetter } from '../server/lib/letter-lint.ts';

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

describe('parseLetterBrief', () => {
  it('reads the brief, keeps two needs and turns "null" text into null', () => {
    const raw = `Here you go: ${JSON.stringify({
      company_detail: 'Social games for millions of players',
      needs: [
        { need: 'React and Next.js at scale', evidence: 'Greenely web app, 70k users' },
        { need: 'Performance', evidence: 'SEO +30%' },
        { need: 'Extra', evidence: 'Extra' },
      ],
      gap: 'null',
      close_offer: 'the assistant',
    })}`;
    expect(parseLetterBrief(raw)).toEqual({
      companyDetail: 'Social games for millions of players',
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
    expect(parseLetterBrief('{"company_detail": "x", "needs": []}')).toBeNull();
    expect(parseLetterBrief('{"company_detail": ')).toBeNull();
  });
});
