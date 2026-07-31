import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { getPool } from '../../src/db/pool';
import { revokeApiKey, seedTenant, type SeededTenant } from '../helpers/seed-tenant';

describe('whoami (integration)', () => {
  let app: INestApplication;
  let seeded: SeededTenant;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    seeded = await seedTenant();
  });

  afterAll(async () => {
    await app.close();
    await getPool().end();
  });

  it('rejects requests with no API key', async () => {
    const response = await request(app.getHttpServer()).get('/whoami');
    expect(response.status).toBe(401);
  });

  it('rejects an unknown API key', async () => {
    const response = await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', 'Bearer sk-mg-test-does-not-exist');
    expect(response.status).toBe(401);
  });

  it('resolves the tenant for a valid API key', async () => {
    const response = await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', `Bearer ${seeded.plaintextKey}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tenantId: seeded.tenantId,
      projectId: seeded.projectId,
      apiKeyId: seeded.apiKeyId,
    });
  });

  it('rejects a revoked API key', async () => {
    const revoked = await seedTenant();
    await revokeApiKey(revoked.apiKeyId);

    const response = await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', `Bearer ${revoked.plaintextKey}`);

    expect(response.status).toBe(401);
  });
});
