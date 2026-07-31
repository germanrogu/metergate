import { afterAll, describe, expect, it } from 'vitest';
import { getIdempotentResponse, storeIdempotentResponse } from '../../src/gateway/idempotency-cache';
import { closeRedisClient } from '../../src/redis/redis-client';

const SAMPLE_RESPONSE = { content: 'hi', inputTokens: 1, outputTokens: 1, costUsdMicros: 100, latencyMs: 5 };

describe('idempotency cache (integration)', () => {
  afterAll(async () => {
    await closeRedisClient();
  });

  it('returns null for a key that was never stored', async () => {
    const result = await getIdempotentResponse('tenant-a', 'never-seen-key');
    expect(result).toBeNull();
  });

  it('round-trips a stored response', async () => {
    await storeIdempotentResponse('tenant-b', 'key-1', SAMPLE_RESPONSE);

    const retrieved = await getIdempotentResponse('tenant-b', 'key-1');
    expect(retrieved).toEqual(SAMPLE_RESPONSE);
  });

  it('scopes cached responses per tenant', async () => {
    await storeIdempotentResponse('tenant-c', 'shared-key', SAMPLE_RESPONSE);

    const otherTenantResult = await getIdempotentResponse('tenant-d', 'shared-key');
    expect(otherTenantResult).toBeNull();
  });
});
