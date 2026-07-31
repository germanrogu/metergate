import { afterAll, describe, expect, it } from 'vitest';
import { getCurrentSpendUsdMicros, reconcileBudget, reserveBudget } from '../../src/budgets/budget-guard';
import { closeRedisClient } from '../../src/redis/redis-client';

function uniqueTenantId(): string {
  return `tenant-${Math.random().toString(36).slice(2)}`;
}

describe('budget guard (integration)', () => {
  afterAll(async () => {
    await closeRedisClient();
  });

  it('reserves an estimated cost within the limit', async () => {
    const tenantId = uniqueTenantId();
    const allowed = await reserveBudget(tenantId, 1_000_000, 10_000_000);

    expect(allowed).toBe(true);
    expect(await getCurrentSpendUsdMicros(tenantId)).toBe(1_000_000);
  });

  it('rejects and rolls back a reservation that would exceed the limit', async () => {
    const tenantId = uniqueTenantId();
    await reserveBudget(tenantId, 9_000_000, 10_000_000);

    const allowed = await reserveBudget(tenantId, 2_000_000, 10_000_000);

    expect(allowed).toBe(false);
    // Rolled back — spend stays at the first reservation, not 9M + 2M.
    expect(await getCurrentSpendUsdMicros(tenantId)).toBe(9_000_000);
  });

  it('reconciles the delta when the actual cost differs from the estimate', async () => {
    const tenantId = uniqueTenantId();
    await reserveBudget(tenantId, 1_000_000, 10_000_000);

    await reconcileBudget(tenantId, 1_000_000, 400_000);

    expect(await getCurrentSpendUsdMicros(tenantId)).toBe(400_000);
  });

  it('tracks spend separately per tenant', async () => {
    const tenantA = uniqueTenantId();
    const tenantB = uniqueTenantId();

    await reserveBudget(tenantA, 5_000_000, 10_000_000);

    expect(await getCurrentSpendUsdMicros(tenantA)).toBe(5_000_000);
    expect(await getCurrentSpendUsdMicros(tenantB)).toBe(0);
  });
});
