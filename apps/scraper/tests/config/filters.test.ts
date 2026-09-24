import { describe, expect, it } from 'vitest';
import { checkTitle, residencyLikely, roleTypeOf } from '../../src/config/filters.ts';

/** Real titles seen on Djinni, LinkedIn and DOU during the first runs. */
const CASES: Array<[title: string, expected: 'ok' | RegExp]> = [
  ['Senior Front End Developer', 'ok'],
  ['Senior Front-End Developer', 'ok'],
  ['Senior Frontend Developer', 'ok'],
  ['Lead Frontend Engineer', 'ok'],
  ['Software Engineer, Front-End', 'ok'],
  ['Frontend Developer (part-time, remote)', 'ok'],
  ['Senior JavaScript Engineer (4492)', 'ok'],
  ['Senior Full-Stack Engineer - AI Cost Visibility- Ukraine(Remote)', 'ok'],
  ['Senior II Full-Stack Engineer (back-end heavy)', 'ok'],
  ['Senior AI-minded Full-Stack React + Node.js', 'ok'],
  ['Senior Product Engineer (React, TypeScript)', 'ok'],
  ['Electron Desktop Engineer', 'ok'],
  ['Team Lead / Senior Frontend Engineer', 'ok'],
  ['Frontend Engineer React IRC 12345', /outsourcing id/],
  ['Senior Full Stack .NET+React Engineer IRC304270', /excluded|outsourcing/],
  ['Senior Roku Engineer; ID 102911', /excluded "roku"|outsourcing/],
  ['Senior Front-End Engineer (Pixi.js)', /excluded "pixi"/],
  ['Senior Frontend Engineer. WebGPU, 3D Visualization', /excluded "webgpu"/],
  ['Java Technical/Team Lead with German (f/m/x)', /excluded "java"/],
  ['Web & Brand Designer', /excluded "designer"/],
  ['Automation Specialist (AI Automation / n8n / Make)', /not a front-end/],
  ['Frontend Developer JS/TS (AI Training)', /excluded "ai training"/],
  ['Senior Angular Developer', /excluded "angular"/],
  ['Senior React/Angular Engineer', 'ok'],
  ['Senior Front-End Engineer – TypeScript / React / Angular', 'ok'],
  ['React Native / Angular Developer', /excluded "react native"/],
  ['Senior Full Stack Developer with Angular & Java/Spring Boot', /excluded "angular"/],
  ['Frontend Developer (Angular v18+) Junior+/Middle level', /excluded/],
  ['Middle Frontend developer (Nuxt)', /excluded "middle"/],
  ['Frontend Web Developer (Vue.js) / HTML Coder', /excluded "vue"/],
  ['Junior Frontend Developer', /excluded "junior"/],
  ['Senior Frontend Engineer (Vue.js, Nuxt, Webflow)', /excluded "vue"/],
  ['Intern front-end developer (Kyiv office)', /excluded "intern"/],
  ['Senior Full Stack Engineer (Vue.js + Node.js) Ukraine/Europe', /excluded "vue"/],
  ['Senior Full Stack Engineer (Go/Java/NET/Node.js/Ruby/C# and React)', /excluded/],
  ['Shopify Front-End Developer and Website Editor', /excluded "shopify"/],
  ['Python Software Engineer with Frontend framework knowledge', /excluded "python"/],
  ['BizAppsDev Developer Senior', /not a front-end/],
  ['Product Manager', /excluded "manager"/],
  ['Senior Security Engineer', /not a front-end/],
  ['Senior AQA Engineer (Python)', /excluded/],
  ['UI/UX Engineer', /excluded "ux"/],
  ['C# Developer', /excluded "c#"/],
  ['.NET Developer', /excluded ".net"/],
  ['React Native Developer', /excluded "react native"/],
  ['Senior Go Engineer', /excluded "go"/],
  ['Mid-Level Frontend Developer', /excluded "mid-level"/],
  ['Frontend Engineer (Mid)', /excluded "mid"/],
  ['React Developer - Talent Pool', /excluded "talent pool"/],
  ['Senior Frontend Entwickler (m/w/d)', /language/],
  ['Développeur Front-End React H/F', /language/],
  ['Ingénieur Frontend React', /language/],
  ['Senior Frontend Engineer (m/f/d)', 'ok'],
  ['Senior Frontend Engineer (all genders)', 'ok'],
];

describe('checkTitle', () => {
  it.each(CASES)('%s', (title, expected) => {
    const verdict = checkTitle(title);
    if (expected === 'ok') {
      expect(verdict).toEqual({ ok: true });
    } else {
      expect(verdict.ok).toBe(false);
      expect(verdict.ok ? '' : verdict.reason).toMatch(expected);
    }
  });
});

describe('roleTypeOf', () => {
  it.each([
    ['Senior Frontend Engineer', 'frontend'],
    ['React Developer', 'frontend'],
    ['Senior Full-Stack Engineer (React/Node)', 'fullstack'],
    ['Fullstack TypeScript Developer', 'fullstack'],
    ['Full Stack Engineer', 'fullstack'],
    ['Staff Frontend Engineer', 'staff'],
    ['Principal Full Stack Engineer', 'staff'],
    ['Frontend Architect', 'staff'],
  ])('%s -> %s', (title, expected) => {
    expect(roleTypeOf(title)).toBe(expected);
  });
});

describe('residencyLikely', () => {
  it('flags one specific country without remote-from-anywhere wording', () => {
    expect(residencyLikely('Madrid, Community of Madrid, Spain', 'We are a remote team.')).toBe(
      true,
    );
    expect(residencyLikely('Poland', null)).toBe(true);
    expect(residencyLikely('Warsaw, Poland (Remote)', 'Great React role.')).toBe(true);
  });

  it('does not flag broad regions, Ukraine or empty locations', () => {
    for (const location of [
      'European Union',
      'Europe',
      'EMEA',
      'Worldwide',
      'Remote',
      'EU',
      null,
    ]) {
      expect(residencyLikely(location, 'React role')).toBe(false);
    }
    expect(residencyLikely('Countries of Europe or Ukraine', 'React role')).toBe(false);
    expect(residencyLikely('Kyiv City, Ukraine', 'React role')).toBe(false);
    expect(residencyLikely('Київ, віддалено', 'React role')).toBe(false);
  });

  it('trusts explicit remote-from-anywhere wording over the location field', () => {
    expect(residencyLikely('Germany', 'You can work remote from anywhere in the EU.')).toBe(false);
    expect(residencyLikely('Spain', 'Remote from Ukraine is fine.')).toBe(false);
    expect(residencyLikely('Netherlands', 'This is an EU-wide remote position.')).toBe(false);
  });
});
