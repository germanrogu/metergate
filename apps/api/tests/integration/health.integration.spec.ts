import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { getPool } from '../../src/db/pool';

describe('health (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await getPool().end();
  });

  it('responds ok over http', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('can reach postgres with migrations applied', async () => {
    const result = await getPool().query('SELECT to_regclass($1) AS exists', ['public.tenants']);

    expect(result.rows[0].exists).toBe('tenants');
  });
});
