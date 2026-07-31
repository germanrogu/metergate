import { fetchWithTimeout } from './fetch-with-timeout';
import {
  Provider,
  ProviderAdapter,
  ProviderChunk,
  ProviderMalformedResponseError,
  ProviderRateLimitedError,
  ProviderRequest,
  ProviderTimeoutError,
} from './provider-adapter';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;

interface MessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// Anthropic takes the system prompt as a top-level field, not as a
// message with role "system" — messages must alternate user/assistant.
export class AnthropicAdapter implements ProviderAdapter {
  readonly provider: Provider = 'anthropic';

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async *send(request: ProviderRequest): AsyncGenerator<ProviderChunk> {
    const response = await this.callApi(request);

    if (response.status === 429) {
      throw new ProviderRateLimitedError(this.provider);
    }
    if (!response.ok) {
      throw new ProviderMalformedResponseError(this.provider);
    }

    const payload = await this.parseResponse(response);
    const content = payload.content?.find((block) => block.type === 'text')?.text;
    const inputTokens = payload.usage?.input_tokens;
    const outputTokens = payload.usage?.output_tokens;

    if (content === undefined || inputTokens === undefined || outputTokens === undefined) {
      throw new ProviderMalformedResponseError(this.provider);
    }

    yield { contentDelta: content, done: false };
    yield { done: true, inputTokens, outputTokens };
  }

  private async callApi(request: ProviderRequest): Promise<Response> {
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const conversation = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content }));

    try {
      return await fetchWithTimeout(
        MESSAGES_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: request.model,
            max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
            ...(system ? { system } : {}),
            messages: conversation,
          }),
        },
        this.timeoutMs,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderTimeoutError(this.provider);
      }
      throw error;
    }
  }

  private async parseResponse(response: Response): Promise<MessagesResponse> {
    try {
      return (await response.json()) as MessagesResponse;
    } catch {
      throw new ProviderMalformedResponseError(this.provider);
    }
  }
}
