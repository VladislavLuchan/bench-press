import { describe, expect, it } from 'vitest';
import type { ChatClient, ChatCompletion, ScoreResult } from '@bench-press/shared';
import {
  parseScoreBatchJson,
  parseScoreJson,
  postValidate,
  scoreBatch,
  scoreJob,
  UsageMeter,
  type ScorableJob,
} from '../../src/pipeline/score.ts';

const valid: ScoreResult = {
  fit: 8,
  summary: 'Strong React match.',
  matches: ['React', 'TypeScript'],
  gaps: ['GraphQL'],
  red_flags: [],
  salary: '$4000-5000',
  remote: true,
  seniority: 'senior',
  primary_stack: 'react',
  location_type: 'remote',
};

const job = (title: string): ScorableJob => ({
  title,
  company: 'Acme',
  location: null,
  salaryRaw: null,
  source: 'djinni',
  description: 'React',
  locationFlag: 'none',
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

  it('defaults missing primary_stack and location_type', () => {
    const { primary_stack: _stack, location_type: _location, ...rest } = valid;
    expect(parseScoreJson(JSON.stringify(rest))).toMatchObject({
      primary_stack: 'other',
      location_type: 'unclear',
    });
    expect(parseScoreJson(JSON.stringify({ ...valid, location_type: 'moon' })).location_type).toBe('unclear');
  });
});

describe('postValidate', () => {
  it('leaves a clean remote react verdict alone', () => {
    expect(postValidate(valid)).toEqual({ score: valid, fitRaw: 8, notes: [] });
  });

  it('caps by location type', () => {
    expect(postValidate({ ...valid, location_type: 'onsite' }).score.fit).toBe(2);
    expect(postValidate({ ...valid, location_type: 'hybrid' }).score.fit).toBe(4);
    expect(postValidate({ ...valid, location_type: 'remote_region_limited' }).score.fit).toBe(4);
    expect(postValidate({ ...valid, location_type: 'hybrid' }).notes).toEqual(['capped at 4: location is hybrid']);
  });

  it('caps off-stack roles at 4 and leaves core stacks alone', () => {
    expect(postValidate({ ...valid, primary_stack: 'angular' }).score.fit).toBe(4);
    expect(postValidate({ ...valid, primary_stack: 'backend', fit: 3 }).score.fit).toBe(3);
    expect(postValidate({ ...valid, primary_stack: 'typescript' }).score.fit).toBe(8);
  });

  it('drops optional requirements from gaps and adds one point each, up to 9', () => {
    const result = postValidate({
      ...valid,
      fit: 7,
      gaps: ['Backend experience is a plus', 'GraphQL nice to have', 'Must have Redux', 'Docker (bonus)'],
    });
    expect(result.score.gaps).toEqual(['Must have Redux']);
    expect(result.score.fit).toBe(9);
    expect(result.fitRaw).toBe(7);
    expect(result.notes).toEqual(['+2: 3 optional requirement(s) removed from gaps']);
  });

  it('never lets the gap bonus beat a location cap', () => {
    const result = postValidate({ ...valid, fit: 6, location_type: 'hybrid', gaps: ['Go is a plus'] });
    expect(result.score.fit).toBe(4);
    expect(result.notes).toEqual([
      '+1: 1 optional requirement(s) removed from gaps',
      'capped at 4: location is hybrid',
    ]);
  });

  it('flags a remote verdict when the regex saw a hub, and unclear locations', () => {
    expect(postValidate(valid, 'soft').score.red_flags).toEqual(['verify location (hub mentioned)']);
    expect(postValidate({ ...valid, location_type: 'unclear' }).score.red_flags).toEqual(['location unclear']);
    expect(postValidate({ ...valid, location_type: 'unclear' }).score.fit).toBe(8);
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
    expect(outcomes.map((o) => (o.ok ? o.score.score.fit : null))).toEqual([8, 6]);
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
    expect(outcomes[0]).toEqual({ ok: true, score: { score: valid, fitRaw: 8, notes: [] } });
    expect(outcomes[1]?.ok).toBe(false);
    expect(chat.calls).toBe(4);
  });
});
