export interface ChatClientOptions {
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1 */
  baseUrl: string;
  timeoutMs?: number;
}

export interface CompletionOptions {
  /** Ask the endpoint for JSON mode. The caller still validates the shape. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /**
   * Reasoning effort for models that think before answering. Their reasoning counts against
   * max_tokens, so a tight limit yields an empty answer. Ignored by non-reasoning models.
   */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatCompletion {
  text: string;
  /** Null when the endpoint did not report usage. */
  usage: TokenUsage | null;
}

export interface ChatClient {
  /** One system + user turn; returns the assistant text and token usage. */
  complete(system: string, user: string, options?: CompletionOptions): Promise<ChatCompletion>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Minimal client for any OpenAI-compatible chat endpoint. OpenRouter is the default so one
 * key covers every model and the spend is visible in one place.
 */
export function createChatClient(options: ChatClientOptions): ChatClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  return {
    async complete(system, user, completion = {}) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
          // Attribution headers used by OpenRouter; harmless elsewhere.
          'HTTP-Referer': 'https://github.com/VladislavLuchan/bench-press',
          'X-Title': 'bench-press',
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          ...(completion.json ? { response_format: { type: 'json_object' } } : {}),
          ...(completion.reasoningEffort
            ? { reasoning: { effort: completion.reasoningEffort, exclude: true } }
            : {}),
          temperature: completion.temperature ?? 0,
          max_tokens: completion.maxTokens ?? 1024,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Chat API HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = (await response.json()) as ChatCompletionResponse;
      if (data.error?.message) throw new Error(`Chat API error: ${data.error.message}`);
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Chat API returned an empty completion');
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
          }
        : null;
      return { text: content, usage };
    },
  };
}
