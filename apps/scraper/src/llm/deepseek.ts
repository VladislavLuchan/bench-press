export interface ChatClient {
  /** Sends one system + user turn and returns the raw assistant text (expected to be JSON). */
  completeJson(system: string, user: string): Promise<string>;
}

export interface DeepSeekOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Minimal client for DeepSeek's OpenAI-compatible chat endpoint. JSON mode is enforced
 * server-side; validation of the shape still happens in the caller.
 */
export function createDeepSeekClient(options: DeepSeekOptions): ChatClient {
  const baseUrl = options.baseUrl ?? 'https://api.deepseek.com';

  return {
    async completeJson(system, user) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
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
        throw new Error(`DeepSeek HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('DeepSeek returned an empty completion');
      return content;
    },
  };
}
