import type { CallerProvider } from '../providers/provider-adapter.factory';
import type { ProviderMessage } from '../providers/provider-adapter';
import type { MockScenario } from '../providers/mock-provider.adapter';

export interface GatewayCompletionRequestBody {
  provider: CallerProvider;
  model: string;
  messages: ProviderMessage[];
  maxTokens?: number;
  feature?: string;
  agentRunId?: string;
  // Only honored when LLM_MODE=mock — lets tests and local dev select a
  // scenario without a real request ever being able to influence it.
  mockScenario?: MockScenario;
}

export interface GatewayCompletionResponseBody {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsdMicros: number | null;
  latencyMs: number;
  // Present and true only when this response was served from the
  // idempotency cache instead of calling the provider again.
  replayed?: boolean;
}
