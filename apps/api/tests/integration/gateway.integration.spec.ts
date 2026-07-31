import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { getPool } from '../../src/db/pool';
import { runWithTenantContext } from '../../src/middleware/tenant-context';
import { storeProviderCredential } from '../../src/provider-credentials/provider-credentials.repository';
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
});
