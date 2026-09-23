import { createChatClient, OPENROUTER_BASE_URL, type ChatClient } from '@bench-press/shared';
import {
  buildAnswerSystemPrompt,
  buildAnswerUserPrompt,
  buildBriefSystemPrompt,
  buildBriefUserPrompt,
  buildCoverLetterSystemPrompt,
  buildCoverLetterUserPrompt,
  buildRevisionUserPrompt,
} from './cover-letter-prompt.ts';
import { parseLetterBrief, type LetterBrief } from './letter-brief.ts';
import { ensureSignature, lintLetter } from './letter-lint.ts';

/**
 * Model for cover letters and form answers. Any OpenRouter id works; swap here to compare
 * quality or price.
 */
const COVER_LETTER_MODEL = process.env.COVER_LETTER_MODEL ?? 'openai/gpt-6-luna';
// Three calls must fit in the 60 s function limit (vercel.json), so each one gets less.
const CALL_TIMEOUT_MS = 18_000;
// Reasoning tokens count against max_tokens, so leave room beyond the ~600-token letter.
const LETTER_OPTIONS = { maxTokens: 4096, temperature: 0.4, reasoningEffort: 'low' } as const;

let client: ChatClient | undefined;

function getClient(): ChatClient {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new Error('LLM_API_KEY is not set');
    client = createChatClient({
      apiKey,
      model: COVER_LETTER_MODEL,
      baseUrl: OPENROUTER_BASE_URL,
      timeoutMs: CALL_TIMEOUT_MS,
    });
  }
  return client;
}

export interface CoverLetterInput {
  profile: string;
  template: string;
  job: { title: string; company: string | null; description: string };
}

/** Step 1: what the letter must prove. A failed plan is not fatal; step 2 then works alone. */
async function planLetter(input: CoverLetterInput): Promise<LetterBrief | null> {
  try {
    const { text } = await getClient().complete(
      buildBriefSystemPrompt(input.profile, input.template),
      buildBriefUserPrompt(input.job),
      { ...LETTER_OPTIONS, json: true, temperature: 0.2 },
    );
    return parseLetterBrief(text);
  } catch (error) {
    console.warn('Cover letter brief failed; writing without it', error);
    return null;
  }
}

/**
 * Plans the letter, writes it, then runs an editor pass that also gets the problems found in
 * code (letter-lint.ts). The edit is kept unless the code checks find more problems in it.
 */
export async function generateCoverLetter(input: CoverLetterInput): Promise<string> {
  const system = buildCoverLetterSystemPrompt(input.profile, input.template);
  const brief = await planLetter(input);
  const { text } = await getClient().complete(
    system,
    buildCoverLetterUserPrompt(input.job, brief),
    LETTER_OPTIONS,
  );
  const letter = text.trim();
  if (!letter) throw new Error('The model returned an empty letter');

  const context = { template: input.template, description: input.job.description };
  const problems = lintLetter(letter, context);
  try {
    const revised = (
      await getClient().complete(
        system,
        buildRevisionUserPrompt(input.job, letter, problems),
        LETTER_OPTIONS,
      )
    ).text.trim();
    const best =
      revised && lintLetter(revised, context).length <= problems.length ? revised : letter;
    return ensureSignature(best, input.template);
  } catch (error) {
    console.warn('Cover letter edit failed; keeping the draft', error);
    return ensureSignature(letter, input.template);
  }
}

export interface AnswerInput {
  profile: string;
  /** The user's saved form answers (the `apply_fields` setting), as written. */
  facts: string;
  question: string;
  job: { title: string; company: string | null; description: string | null };
}

/** Drafts one answer for a question on an application form; the user reviews and pastes it. */
export async function generateAnswer(input: AnswerInput): Promise<string> {
  const { text } = await getClient().complete(
    buildAnswerSystemPrompt(input.profile, input.facts),
    buildAnswerUserPrompt(input.question, input.job),
    LETTER_OPTIONS,
  );
  const answer = text.trim();
  if (!answer) throw new Error('The model returned an empty answer');
  return answer;
}
