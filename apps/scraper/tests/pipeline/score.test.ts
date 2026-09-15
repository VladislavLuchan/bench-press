import { describe, expect, it } from 'vitest';
import type { Job } from '@bench-press/shared';
import type { ChatClient } from '../../src/llm/deepseek.ts';
import { parseScoreJson, scoreJob } from '../../src/pipeline/score.ts';

const valid = {
  fit: 8,
  summary: 'Strong React match.',
  matches: ['React', 'TypeScript'],
  gaps: ['GraphQL'],
  red_flags: [],
  salary: '$4000-5000',
  remote: true,
  seniority: 'senior',
};

describe('parseScoreJson', () => {
  it('accepts a valid object', () => {
    expect(parseScoreJson(JSON.stringify(valid))).toEqual(valid);
  });

  it('tolerates code fences and prose around the JSON', () => {
    expect(parseScoreJson('Sure!\n```json\n' + JSON.stringify(valid) + '\n```')).toEqual(valid);
  });

  it('rejects out-of-range fit and missing fields', () => {
    expect(() => parseScoreJson(JSON.stringify({ ...valid, fit: 11 }))).toThrow(/validation/);
    expect(() => parseScoreJson(JSON.stringify({ fit: 5 }))).toThrow(/validation/);
    expect(() => parseScoreJson('not json')).toThrow();
  });
});

describe('scoreJob', () => {
  const job = {
    title: 'Frontend',
    company: 'Acme',
    location: null,
    salaryRaw: null,
    description: 'React',
  } as Job;

  it('retries once on a malformed answer and then succeeds', async () => {
    const answers = ['{"fit": "high"}', JSON.stringify(valid)];
    const chat: ChatClient = { completeJson: async () => answers.shift() ?? '' };
    await expect(scoreJob(job, 'system', chat, 2)).resolves.toEqual(valid);
  });

  it('gives up after the configured retries', async () => {
    const chat: ChatClient = { completeJson: async () => 'nope' };
    await expect(scoreJob(job, 'system', chat, 1)).rejects.toThrow(/after 2 attempts/);
  });
});
