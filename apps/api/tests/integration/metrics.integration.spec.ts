import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { getPool } from '../../src/db/pool';
import { runWithTenantContext } from '../../src/middleware/tenant-context';
import { storeProviderCredential } from '../../src/provider-credentials/provider-credentials.repository';
import { closeRedisClient } from '../../src/redis/redis-client';
import { seedTenant, type SeededTenant } from '../helpers/seed-tenant';

describe('metrics endpoint (integration)', () => {
  let app: INestApplication;
  let seeded: SeededTenant;

  beforeAll(async () => {
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

  it('exposes gateway request metrics in Prometheus text format after a completion', async () => {
    await request(app.getHttpServer())
      .post('/v1/chat/completions')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`)
      .send({
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello metrics' }],
        feature: 'metrics-test',
      });

    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('gateway_requests_total');
    expect(response.text).toContain('provider="openai"');
    expect(response.text).toContain('gateway_request_latency_ms');
  });
});
