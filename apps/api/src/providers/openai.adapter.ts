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

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30_000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

// Non-streaming for now (stream: false) — streaming support, and the
// partial-delivery billing semantics it requires, land in the
// reliability phase once the non-streaming path is proven end to end.
export class OpenAiAdapter implements ProviderAdapter {
  readonly provider: Provider = 'openai';

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
    const content = payload.choices?.[0]?.message?.content;
    const inputTokens = payload.usage?.prompt_tokens;
    const outputTokens = payload.usage?.completion_tokens;

    if (content === undefined || inputTokens === undefined || outputTokens === undefined) {
      throw new ProviderMalformedResponseError(this.provider);
    }

    yield { contentDelta: content, done: false };
    yield { done: true, inputTokens, outputTokens };
  }

  private async callApi(request: ProviderRequest): Promise<Response> {
    try {
      return await fetchWithTimeout(
        CHAT_COMPLETIONS_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxTokens,
            stream: false,
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

  private async parseResponse(response: Response): Promise<ChatCompletionResponse> {
    try {
      return (await response.json()) as ChatCompletionResponse;
    } catch {
      throw new ProviderMalformedResponseError(this.provider);
    }
  }
}
