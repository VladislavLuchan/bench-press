import Anthropic from '@anthropic-ai/sdk';
import { buildCoverLetterSystemPrompt, buildCoverLetterUserPrompt } from './cover-letter-prompt.ts';

const MODEL = 'claude-opus-5';

let client: Anthropic | undefined;

function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export interface CoverLetterInput {
  profile: string;
  template: string;
  job: { title: string; company: string | null; description: string };
}

/** One non-streaming call; letters are short, so it finishes well within the function limit. */
export async function generateCoverLetter(input: CoverLetterInput): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: 'medium' },
    system: [
      {
        type: 'text',
        text: buildCoverLetterSystemPrompt(input.profile, input.template),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildCoverLetterUserPrompt(input.job) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to write this letter');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('The model returned an empty letter');
  return text;
}
