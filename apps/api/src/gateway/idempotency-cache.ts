import { getRedisClient } from '../redis/redis-client';
import type { GatewayCompletionResponseBody } from './gateway.dto';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function cacheKey(tenantId: string, idempotencyKey: string): string {
  return `idempotency:${tenantId}:${idempotencyKey}`;
}

// Only successful responses are cached — same semantics as Stripe's
// idempotency keys: a request that errored is not "safe to have
// happened," so a retry is expected to actually try again, not replay
// a failure forever.
export async function getIdempotentResponse(
  tenantId: string,
  idempotencyKey: string,
): Promise<GatewayCompletionResponseBody | null> {
  const raw = await getRedisClient().get(cacheKey(tenantId, idempotencyKey));
  return raw ? (JSON.parse(raw) as GatewayCompletionResponseBody) : null;
}

export async function storeIdempotentResponse(
  tenantId: string,
  idempotencyKey: string,
  response: GatewayCompletionResponseBody,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  await getRedisClient().set(cacheKey(tenantId, idempotencyKey), JSON.stringify(response), 'EX', ttlSeconds);
}
