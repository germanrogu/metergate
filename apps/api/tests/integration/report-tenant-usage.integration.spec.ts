import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { reportTenantUsage } from '../../src/billing/report-tenant-usage';
import { StripeClient } from '../../src/billing/stripe-client';
import { getUnbilledUsageEvents } from '../../src/billing/usage-billing.repository';
import { getPool } from '../../src/db/pool';
import { runWithTenantContext } from '../../src/middleware/tenant-context';
import { recordUsageEvent } from '../../src/metering/metering.repository';
import { seedTenant } from '../helpers/seed-tenant';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

async function seedUnbilledUsageEvent(apiKeyId: string, costUsdMicros: number): Promise<void> {
  await recordUsageEvent({
    apiKeyId,
    provider: 'openai',
    model: 'gpt-4o-mini',
    feature: null,
    agentRunId: null,
    inputTokens: 10,
    outputTokens: 5,
    latencyMs: 100,
    costUsdMicros,
    pricingUnresolved: false,
    status: 'success',
    errorCode: null,
    terminatedReason: null,
    idempotencyKey: null,
  });
}

describe('reportTenantUsage (integration)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('reports unbilled usage events and marks them billed so a re-run finds nothing left', async () => {
    const tenant = await seedTenant();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { identifier: 'idem-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const stripeClient = new StripeClient('sk_test_x');

    await runWithTenantContext(tenant.tenantId, async () => {
      await seedUnbilledUsageEvent(tenant.apiKeyId, 1234);

      const first = await reportTenantUsage(stripeClient, 'cus_test_123');
      expect(first).toEqual({ reportedCount: 1, failedCount: 0 });

      const second = await reportTenantUsage(stripeClient, 'cus_test_123');
      expect(second).toEqual({ reportedCount: 0, failedCount: 0 });

      expect(await getUnbilledUsageEvents()).toHaveLength(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves an event unbilled if reporting it to Stripe fails', async () => {
    const tenant = await seedTenant();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server error', { status: 500 })));
    const stripeClient = new StripeClient('sk_test_x');

    await runWithTenantContext(tenant.tenantId, async () => {
      await seedUnbilledUsageEvent(tenant.apiKeyId, 1234);

      const result = await reportTenantUsage(stripeClient, 'cus_test_123');
      expect(result).toEqual({ reportedCount: 0, failedCount: 1 });

      expect(await getUnbilledUsageEvents()).toHaveLength(1);
    });
  });

  it('reports multiple unbilled events independently', async () => {
    const tenant = await seedTenant();
    // A fresh Response per call — reusing one mockResolvedValue
    // instance across multiple calls fails from the second call
    // onward, since a Response body can only be read once.
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, { identifier: 'idem' })));
    vi.stubGlobal('fetch', fetchMock);
    const stripeClient = new StripeClient('sk_test_x');

    await runWithTenantContext(tenant.tenantId, async () => {
      await seedUnbilledUsageEvent(tenant.apiKeyId, 100);
      await seedUnbilledUsageEvent(tenant.apiKeyId, 200);
      await seedUnbilledUsageEvent(tenant.apiKeyId, 300);

      const result = await reportTenantUsage(stripeClient, 'cus_test_123');
      expect(result).toEqual({ reportedCount: 3, failedCount: 0 });
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
