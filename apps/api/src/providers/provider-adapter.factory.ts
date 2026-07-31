import { AnthropicAdapter } from './anthropic.adapter';
import { MockProviderAdapter, type MockScenario } from './mock-provider.adapter';
import { OpenAiAdapter } from './openai.adapter';
import type { ProviderAdapter } from './provider-adapter';

export type CallerProvider = 'openai' | 'anthropic';

export interface CreateProviderAdapterOptions {
  provider: CallerProvider;
  credential: string;
  mockScenario?: MockScenario | undefined;
}

// LLM_MODE gates real network calls out of dev/CI entirely: 'mock'
// always returns MockProviderAdapter regardless of which provider was
// requested, so metering/pricing/attribution can be exercised for a
// real model id (e.g. gpt-4o-mini) without spending real money.
export function createProviderAdapter(options: CreateProviderAdapterOptions): ProviderAdapter {
  if (process.env['LLM_MODE'] === 'mock') {
    return new MockProviderAdapter({ scenario: options.mockScenario ?? 'success' });
  }

  switch (options.provider) {
    case 'openai':
      return new OpenAiAdapter(options.credential);
    case 'anthropic':
      return new AnthropicAdapter(options.credential);
  }
}
