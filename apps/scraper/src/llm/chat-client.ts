export interface ChatClient {
  /** Sends one system + user turn and returns the raw assistant text (expected to be JSON). */
  completeJson(system: string, user: string): Promise<string>;
}

export interface ChatClientOptions {
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1 or https://api.deepseek.com */
  baseUrl: string;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Minimal client for any OpenAI-compatible chat endpoint (OpenRouter, DeepSeek, ...).
 * JSON mode is requested server-side; validation of the shape still happens in the caller.
 */
export function createChatClient(options: ChatClientOptions): ChatClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  return {
    async completeJson(system, user) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
          // Optional attribution headers used by OpenRouter; harmless elsewhere.
          'HTTP-Referer': 'https://github.com/VladislavLuchan/bench-press',
          'X-Title': 'bench-press',
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Chat API HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Chat API returned an empty completion');
      return content;
    },
  };
}
