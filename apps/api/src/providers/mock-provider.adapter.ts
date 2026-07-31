import {
  ProviderAdapter,
  ProviderChunk,
  ProviderMalformedResponseError,
  ProviderRateLimitedError,
  ProviderRequest,
  ProviderStreamCutoffError,
  ProviderTimeoutError,
} from './provider-adapter';

export type MockScenario = 'success' | 'timeout' | 'cutoff' | 'rate_limited' | 'malformed';

export interface MockProviderAdapterOptions {
  scenario: MockScenario;
  timeoutMs?: number;
}

const MOCK_REPLY = 'This is a mock response used for deterministic testing.';
const CUTOFF_PARTIAL_REPLY = 'This response was cut short';
const DEFAULT_TIMEOUT_MS = 50;

// Every real provider incident we need to test for (slow/hung request,
// disconnect mid-stream, rate limiting, garbage response) has a fixed,
// deterministic scenario here — no network calls, no flakiness in CI.
export class MockProviderAdapter implements ProviderAdapter {
  readonly provider = 'mock' as const;

  constructor(private readonly options: MockProviderAdapterOptions) {}

  async *send(request: ProviderRequest): AsyncGenerator<ProviderChunk> {
    const inputTokens = countWords(request.messages.map((message) => message.content).join(' '));

    switch (this.options.scenario) {
      case 'success': {
        yield { contentDelta: MOCK_REPLY, done: false };
        yield { done: true, inputTokens, outputTokens: countWords(MOCK_REPLY) };
        return;
      }
      case 'timeout': {
        await sleep(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        throw new ProviderTimeoutError(this.provider);
      }
      case 'rate_limited': {
        throw new ProviderRateLimitedError(this.provider);
      }
      case 'cutoff': {
        yield { contentDelta: CUTOFF_PARTIAL_REPLY, done: false };
        throw new ProviderStreamCutoffError(this.provider, CUTOFF_PARTIAL_REPLY, countWords(CUTOFF_PARTIAL_REPLY));
      }
      case 'malformed': {
        throw new ProviderMalformedResponseError(this.provider);
      }
    }
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
