export type Provider = 'openai' | 'anthropic' | 'mock';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  maxTokens?: number;
}

export interface ProviderChunk {
  contentDelta?: string;
  done: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  send(request: ProviderRequest): AsyncGenerator<ProviderChunk>;
}

export class ProviderTimeoutError extends Error {
  constructor(provider: Provider) {
    super(`${provider} did not respond in time`);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderRateLimitedError extends Error {
  constructor(provider: Provider) {
    super(`${provider} rejected the request with a rate limit error`);
    this.name = 'ProviderRateLimitedError';
  }
}

export class ProviderStreamCutoffError extends Error {
  constructor(
    provider: Provider,
    public readonly deliveredContent: string,
    public readonly deliveredOutputTokens: number,
  ) {
    super(`${provider} disconnected mid-stream after delivering partial content`);
    this.name = 'ProviderStreamCutoffError';
  }
}

export class ProviderMalformedResponseError extends Error {
  constructor(provider: Provider) {
    super(`${provider} returned a response that could not be parsed`);
    this.name = 'ProviderMalformedResponseError';
  }
}
