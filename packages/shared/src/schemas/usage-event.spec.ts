import { describe, expect, it } from 'vitest';
import { usageEventSchema } from './usage-event';

describe('usageEventSchema', () => {
  it('accepts a valid usage event with unresolved pricing', () => {
    const result = usageEventSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      apiKeyId: '33333333-3333-3333-3333-333333333333',
      provider: 'openai',
      model: 'gpt-5-mini',
      feature: 'document-summary',
      agentRunId: null,
      inputTokens: 120,
      outputTokens: 45,
      latencyMs: 812,
      costUsdMicros: null,
      pricingUnresolved: true,
      status: 'success',
      terminatedReason: null,
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown provider', () => {
    const result = usageEventSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      apiKeyId: '33333333-3333-3333-3333-333333333333',
      provider: 'not-a-real-provider',
      model: 'gpt-5-mini',
      feature: null,
      agentRunId: null,
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 100,
      costUsdMicros: 42,
      pricingUnresolved: false,
      status: 'success',
      terminatedReason: null,
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});
