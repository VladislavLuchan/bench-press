import { createChatClient, OPENROUTER_BASE_URL, type ChatClient } from '@bench-press/shared';
import { buildCoverLetterSystemPrompt, buildCoverLetterUserPrompt } from './cover-letter-prompt.ts';

/** Model for cover letters. Any OpenRouter id works; swap here to compare quality or price. */
const COVER_LETTER_MODEL = process.env.COVER_LETTER_MODEL ?? 'openai/gpt-6-luna';

let client: ChatClient | undefined;

function getClient(): ChatClient {
  if (!client) {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new Error('LLM_API_KEY is not set');
    client = createChatClient({ apiKey, model: COVER_LETTER_MODEL, baseUrl: OPENROUTER_BASE_URL });
  }
  return client;
}

export interface CoverLetterInput {
  profile: string;
  template: string;
  job: { title: string; company: string | null; description: string };
}

export async function generateCoverLetter(input: CoverLetterInput): Promise<string> {
  const { text } = await getClient().complete(
    buildCoverLetterSystemPrompt(input.profile, input.template),
    buildCoverLetterUserPrompt(input.job),
    // Reasoning tokens count against max_tokens, so leave room beyond the ~600-token letter.
    { maxTokens: 4096, temperature: 0.4, reasoningEffort: 'low' },
  );
  const letter = text.trim();
  if (!letter) throw new Error('The model returned an empty letter');
  return letter;
}
