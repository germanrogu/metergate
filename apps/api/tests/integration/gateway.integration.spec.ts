import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { getCurrentSpendUsdMicros } from '../../src/budgets/budget-guard';
import { getPool } from '../../src/db/pool';
import { runWithTenantContext } from '../../src/middleware/tenant-context';
import { storeProviderCredential } from '../../src/provider-credentials/provider-credentials.repository';
import { closeRedisClient } from '../../src/redis/redis-client';
import { queryAsMigrator, seedTenant, type SeededTenant } from '../helpers/seed-tenant';

interface UsageEventRow {
  input_tokens: number;
  output_tokens: number;
  cost_usd_micros: string;
  status: string;
}

describe('gateway proxy (integration)', () => {
  let app: INestApplication;
  let seeded: SeededTenant;

  beforeAll(async () => {
    process.env['LLM_MODE'] = 'mock';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    seeded = await seedTenant();
    await runWithTenantContext(seeded.tenantId, async () => {
      await storeProviderCredential('openai', 'sk-test-not-a-real-key');
    });
  });

  afterAll(async () => {
    await app.close();
    await getPool().end();
    await closeRedisClient();
  });

  it('rejects a request for a provider with no configured credential', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .send({ provider: 'anthropic', model: 'claude-3-5-haiku-latest', messages: [{ role: 'user', content: 'hi' }] });

    expect(response.status).toBe(400);
  });

  it('rejects a malformed request body', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .send({ provider: 'openai', model: 'gpt-4o-mini', messages: [] });

    expect(response.status).toBe(400);
  });

  it('completes a request, returns cost, and records a usage event', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .send({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello gateway, please respond' }],
        feature: 'gateway-integration-test',
      });

    expect(response.status).toBe(200);
    expect(response.body.inputTokens).toBeGreaterThan(0);
    expect(response.body.outputTokens).toBeGreaterThan(0);
    expect(response.body.costUsdMicros).toBeGreaterThan(0);
    expect(typeof response.body.content).toBe('string');

    const rows = await queryAsMigrator<UsageEventRow>(
      'SELECT input_tokens, output_tokens, cost_usd_micros, status FROM usage_events WHERE tenant_id = $1 AND feature = $2',
      [seeded.tenantId, 'gateway-integration-test'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('success');
    expect(Number(rows[0]?.cost_usd_micros)).toBe(response.body.costUsdMicros);
  });

  it('records a blocked/error usage event when the provider rate-limits', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .send({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
        feature: 'rate-limit-test',
        mockScenario: 'rate_limited',
      });

    expect(response.status).toBe(429);

    const rows = await queryAsMigrator<UsageEventRow>(
      'SELECT status FROM usage_events WHERE tenant_id = $1 AND feature = $2',
      [seeded.tenantId, 'rate-limit-test'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('error');
  });

  it('bills for partial content delivered before a mid-stream cutoff', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .send({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
        feature: 'cutoff-test',
        mockScenario: 'cutoff',
      });

    expect(response.status).toBe(502);

    const rows = await queryAsMigrator<UsageEventRow>(
      'SELECT input_tokens, output_tokens, cost_usd_micros, status FROM usage_events WHERE tenant_id = $1 AND feature = $2',
      [seeded.tenantId, 'cutoff-test'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('success');
    expect(rows[0]?.output_tokens).toBeGreaterThan(0);
    expect(Number(rows[0]?.cost_usd_micros)).toBeGreaterThan(0);
  });

  it('replays a cached response for a repeated idempotency key instead of calling the provider again', async () => {
    const idempotencyKey = `idem-${Math.random().toString(36).slice(2)}`;
    const payload = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello idempotent world' }],
      feature: 'idempotency-test',
    };

    const first = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.replayed).toBeUndefined();

    const second = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body).toMatchObject({
      content: first.body.content,
      inputTokens: first.body.inputTokens,
      outputTokens: first.body.outputTokens,
      costUsdMicros: first.body.costUsdMicros,
      latencyMs: first.body.latencyMs,
    });

    const rows = await queryAsMigrator<UsageEventRow>(
      'SELECT id FROM usage_events WHERE tenant_id = $1 AND feature = $2',
      [seeded.tenantId, 'idempotency-test'],
    );
    expect(rows).toHaveLength(1);
  });

  it('opens the circuit after repeated failures and fails fast without calling the provider again', async () => {
    // A separate model (gpt-4o, not gpt-4o-mini) keeps this test's
    // circuit-breaker state isolated from the other tests in this file.
    const failingPayload = {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'trip the breaker' }],
      feature: 'circuit-breaker-test',
      mockScenario: 'malformed',
    };

    // Default threshold is 5 consecutive failures.
    for (let i = 0; i < 5; i += 1) {
      const response = await request(app.getHttpServer())
        .post('/v1/chat/completions')
        .set('Authorization', `Bearer ${seeded.plaintextKey}`)
        .send(failingPayload);
      expect(response.status).toBe(502);
    }

    const blockedResponse = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .send({ ...failingPayload, mockScenario: 'success', feature: 'circuit-breaker-test' });

    expect(blockedResponse.status).toBe(503);

    const rows = await queryAsMigrator<UsageEventRow>(
      "SELECT status FROM usage_events WHERE tenant_id = $1 AND feature = $2 AND status = 'blocked'",
      [seeded.tenantId, 'circuit-breaker-test'],
    );
    expect(rows).toHaveLength(1);
  });

  it('rate-limits a tenant whose plan has an exhausted burst', async () => {
    // A dedicated tenant with a burst of 1 and near-zero refill, so the
    // very next request within the test is guaranteed to be blocked
    // regardless of how fast the test runner executes.
    const limited = await seedTenant({ rateLimitPerMinute: 1, rateLimitBurst: 1 });
    await runWithTenantContext(limited.tenantId, async () => {
      await storeProviderCredential('openai', 'sk-test-not-a-real-key');
    });

    const payload = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      feature: 'rate-limit-plan-test',
    };

    const first = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${limited.plaintextKey}`)
      .send(payload);
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${limited.plaintextKey}`)
      .send(payload);
    expect(second.status).toBe(429);

    const rows = await queryAsMigrator<UsageEventRow>(
      "SELECT status FROM usage_events WHERE tenant_id = $1 AND feature = $2 AND status = 'blocked'",
      [limited.tenantId, 'rate-limit-plan-test'],
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects a call that would exceed the monthly budget', async () => {
    // A budget of 100 micros is smaller than even the reservation for
    // a single short call, so the very first request is guaranteed to
    // be rejected — no need to burn through a real budget first.
    const brokeTenant = await seedTenant({ monthlyBudgetUsdMicros: 100 });
    await runWithTenantContext(brokeTenant.tenantId, async () => {
      await storeProviderCredential('openai', 'sk-test-not-a-real-key');
    });

    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${brokeTenant.plaintextKey}`)
      .send({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }],
        feature: 'budget-test',
      });

    expect(response.status).toBe(402);

    const rows = await queryAsMigrator<UsageEventRow>(
      "SELECT status FROM usage_events WHERE tenant_id = $1 AND feature = $2 AND status = 'blocked'",
      [brokeTenant.tenantId, 'budget-test'],
    );
    expect(rows).toHaveLength(1);
  });

  it('reconciles the budget reservation down to the actual cost after a successful call', async () => {
    const tenant = await seedTenant({ monthlyBudgetUsdMicros: 10_000_000 });
    await runWithTenantContext(tenant.tenantId, async () => {
      await storeProviderCredential('openai', 'sk-test-not-a-real-key');
    });

    const response = await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${tenant.plaintextKey}`)
      .send({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        feature: 'budget-reconcile-test',
      });

    expect(response.status).toBe(200);

    const spend = await getCurrentSpendUsdMicros(tenant.tenantId);
    // The real cost (a handful of tokens) is far smaller than the
    // reservation (sized for the 512-token default estimate) — proving
    // the reservation was trued up rather than left at the estimate.
    expect(spend).toBe(response.body.costUsdMicros);
  });
});
