import { describe, expect, it } from 'vitest';
import type { ChatClient, ChatCompletion } from '@bench-press/shared';
import {
  applyStackCap,
  parseScoreBatchJson,
  parseScoreJson,
  scoreBatch,
  scoreJob,
  UsageMeter,
  type ScorableJob,
} from '../../src/pipeline/score.ts';

const valid = {
  fit: 8,
  summary: 'Strong React match.',
  matches: ['React', 'TypeScript'],
  gaps: ['GraphQL'],
  red_flags: [],
  salary: '$4000-5000',
  remote: true,
  seniority: 'senior',
  primary_stack: 'react',
};

const job = (title: string): ScorableJob => ({
  title,
  company: 'Acme',
  location: null,
  salaryRaw: null,
  source: 'djinni',
  description: 'React',
});

function chatWith(answers: string[]): ChatClient & { calls: number } {
  const client = {
    calls: 0,
    complete: async (): Promise<ChatCompletion> => {
      client.calls++;
      return { text: answers.shift() ?? '', usage: { promptTokens: 100, completionTokens: 10 } };
    },
  };
  return client;
}

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

  it('defaults a missing primary_stack to other and caps the fit', () => {
    const { primary_stack: _stack, ...withoutStack } = valid;
    expect(parseScoreJson(JSON.stringify(withoutStack))).toMatchObject({ primary_stack: 'other', fit: 4 });
  });
});

describe('applyStackCap', () => {
  it('caps off-stack roles at 4 and leaves core stacks alone', () => {
    expect(applyStackCap({ ...valid, primary_stack: 'angular' }).fit).toBe(4);
    expect(applyStackCap({ ...valid, primary_stack: 'backend', fit: 3 }).fit).toBe(3);
    expect(applyStackCap({ ...valid, primary_stack: 'typescript' }).fit).toBe(8);
  });
});

describe('parseScoreBatchJson', () => {
  it('requires exactly one result per job', () => {
    const two = JSON.stringify({ results: [valid, valid] });
    expect(parseScoreBatchJson(two, 2)).toHaveLength(2);
    expect(() => parseScoreBatchJson(two, 3)).toThrow(/2 results for 3 jobs/);
    expect(() => parseScoreBatchJson('{"results": "nope"}', 1)).toThrow(/validation/);
  });
});

describe('scoreJob', () => {
  it('retries once on a malformed answer and then succeeds', async () => {
    const chat = chatWith(['{"fit": "high"}', JSON.stringify(valid)]);
    const meter = new UsageMeter();
    await expect(scoreJob(job('Frontend'), 'system', chat, 2, meter)).resolves.toEqual(valid);
    expect(meter.promptTokens).toBe(200);
  });

  it('gives up after the configured retries', async () => {
    const chat = chatWith(['nope', 'nope']);
    await expect(scoreJob(job('Frontend'), 'system', chat, 1)).rejects.toThrow(/after 2 attempts/);
  });
});

describe('scoreBatch', () => {
  it('uses one request for a good batch answer', async () => {
    const chat = chatWith([JSON.stringify({ results: [valid, { ...valid, fit: 6 }] })]);
    const outcomes = await scoreBatch([job('A'), job('B')], 'system', chat);
    expect(outcomes.map((o) => (o.ok ? o.score.fit : null))).toEqual([8, 6]);
    expect(chat.calls).toBe(1);
  });

  it('falls back to one request per job when the batch answer is unusable', async () => {
    const chat = chatWith([
      JSON.stringify({ results: [valid] }),
      JSON.stringify(valid),
      'garbage',
      'garbage',
    ]);
    const outcomes = await scoreBatch([job('A'), job('B')], 'system', chat);
    expect(outcomes[0]).toEqual({ ok: true, score: valid });
    expect(outcomes[1]?.ok).toBe(false);
    expect(chat.calls).toBe(4);
  });
});
