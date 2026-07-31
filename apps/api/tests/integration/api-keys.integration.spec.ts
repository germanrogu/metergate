import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { getPool } from '../../src/db/pool';
import { seedTenant, type SeededTenant } from '../helpers/seed-tenant';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('API keys management (integration)', () => {
  let app: INestApplication;
  let tenant: SeededTenant;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    tenant = await seedTenant();
  });

  afterAll(async () => {
    await app.close();
    await getPool().end();
  });

  function authedGet(path: string) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${tenant.plaintextKey}`);
  }

  function authedPost(path: string, body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${tenant.plaintextKey}`)
      .send(body);
  }

  async function whoamiStatus(plaintextKey: string): Promise<number> {
    const response = await request(app.getHttpServer())
      .get('/whoami')
      .set('Authorization', `Bearer ${plaintextKey}`);
    return response.status;
  }

  it('creates a new key and lists it alongside the seeded one', async () => {
    const createResponse = await authedPost('/api-keys', { label: 'CI test key', scopes: ['openai'] });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.plaintextKey).toMatch(/^sk-mg-live-/);

    const listResponse = await authedGet('/api-keys');
    expect(listResponse.status).toBe(200);
    const labels = listResponse.body.map((key: { label: string }) => key.label);
    expect(labels).toContain('CI test key');
    expect(listResponse.body.every((key: { plaintextKey?: string }) => key.plaintextKey === undefined)).toBe(true);
  });

  it('revokes a key immediately, invalidating it right away', async () => {
    const createResponse = await authedPost('/api-keys', { label: 'To be revoked', scopes: ['openai'] });
    const created = createResponse.body;

    expect(await whoamiStatus(created.plaintextKey)).toBe(200);

    const revokeResponse = await authedPost(`/api-keys/${created.id}/revoke`);
    expect(revokeResponse.status).toBe(201);

    expect(await whoamiStatus(created.plaintextKey)).toBe(401);
  });

  it('rotates a key with a grace period, keeping the old key valid until it elapses', async () => {
    const createResponse = await authedPost('/api-keys', { label: 'Rotate me', scopes: ['openai'] });
    const original = createResponse.body;

    const rotateResponse = await authedPost(`/api-keys/${original.id}/rotate`, { graceHours: 24 });

    expect(rotateResponse.status).toBe(201);
    expect(rotateResponse.body.newKey.plaintextKey).toMatch(/^sk-mg-live-/);
    expect(rotateResponse.body.newKey.label).toBe('Rotate me (rotated)');

    // Both keys still work — the old one hasn't reached its scheduled
    // revocation yet, and the new one is active from creation.
    expect(await whoamiStatus(original.plaintextKey)).toBe(200);
    expect(await whoamiStatus(rotateResponse.body.newKey.plaintextKey)).toBe(200);
  });

  it('rotates a key with a zero-hour grace period, revoking the old key almost immediately', async () => {
    const createResponse = await authedPost('/api-keys', { label: 'Rotate with no grace', scopes: ['openai'] });
    const original = createResponse.body;

    const rotateResponse = await authedPost(`/api-keys/${original.id}/rotate`, { graceHours: 0 });

    expect(rotateResponse.status).toBe(201);

    await sleep(50);

    expect(await whoamiStatus(original.plaintextKey)).toBe(401);
    expect(await whoamiStatus(rotateResponse.body.newKey.plaintextKey)).toBe(200);
  });

  it('returns 404 when rotating or revoking a key that does not exist', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';

    expect((await authedPost(`/api-keys/${missingId}/revoke`)).status).toBe(404);
    expect((await authedPost(`/api-keys/${missingId}/rotate`)).status).toBe(404);
  });
});
