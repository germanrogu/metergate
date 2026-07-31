import { withTenantTransaction } from '../db/with-tenant-transaction';
import type { Provider } from '../providers/provider-adapter';

export type UsageEventStatus = 'success' | 'error' | 'blocked';

export interface RecordUsageEventInput {
  apiKeyId: string;
  provider: Provider;
  model: string;
  feature: string | null;
  agentRunId: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsdMicros: number | null;
  pricingUnresolved: boolean;
  status: UsageEventStatus;
  errorCode: string | null;
  terminatedReason: string | null;
  idempotencyKey: string | null;
}

// tenant_id comes from current_setting('app.tenant_id'), same reasoning
// as provider_credentials: the RLS policy enforces it independently of
// whatever the caller passes, so there's one source of truth for it.
export async function recordUsageEvent(input: RecordUsageEventInput): Promise<{ id: string } | null> {
  return withTenantTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO usage_events (
         tenant_id, api_key_id, provider, model, feature, agent_run_id,
         input_tokens, output_tokens, latency_ms, cost_usd_micros, pricing_unresolved,
         status, error_code, terminated_reason, idempotency_key
       ) VALUES (
         current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14
       )
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.apiKeyId,
        input.provider,
        input.model,
        input.feature,
        input.agentRunId,
        input.inputTokens,
        input.outputTokens,
        input.latencyMs,
        input.costUsdMicros,
        input.pricingUnresolved,
        input.status,
        input.errorCode,
        input.terminatedReason,
        input.idempotencyKey,
      ],
    );
    return result.rows[0] ?? null;
  });
}
