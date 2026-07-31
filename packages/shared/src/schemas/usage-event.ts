import { z } from 'zod';

export const providerSchema = z.enum(['openai', 'anthropic']);
export type Provider = z.infer<typeof providerSchema>;

export const usageEventStatusSchema = z.enum(['success', 'error', 'blocked']);
export type UsageEventStatus = z.infer<typeof usageEventStatusSchema>;

// cost is always an integer number of USD micros (1 USD = 1_000_000 micros)
// to avoid floating point drift in anything that touches billing.
export const usageEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  apiKeyId: z.string().uuid(),
  provider: providerSchema,
  model: z.string().min(1),
  feature: z.string().nullable(),
  agentRunId: z.string().uuid().nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  costUsdMicros: z.number().int().nonnegative().nullable(),
  pricingUnresolved: z.boolean(),
  status: usageEventStatusSchema,
  terminatedReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type UsageEvent = z.infer<typeof usageEventSchema>;
