import { Client } from 'pg';
import { generateApiKey } from '../../src/api-keys/api-key.util';

export interface SeededTenant {
  tenantId: string;
  projectId: string;
  apiKeyId: string;
  plaintextKey: string;
}

// Uses MIGRATIONS_DATABASE_URL directly (bypasses RLS) because test
// fixtures need to create a tenant before any tenant context exists —
// the same bootstrapping problem the production seed script solves.
export async function seedTenant(): Promise<SeededTenant> {
  const client = new Client({ connectionString: process.env['MIGRATIONS_DATABASE_URL'] });
  await client.connect();

  try {
    const planResult = await client.query<{ id: string }>(
      `INSERT INTO plans (name, monthly_budget_usd_micros, rate_limit_per_minute, rate_limit_burst)
       VALUES ($1, 10000000000, 60, 20)
       RETURNING id`,
      [`test-plan-${crypto.randomUUID()}`],
    );

    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan_id)
       VALUES ('Test Tenant', $1, $2)
       RETURNING id`,
      [`test-tenant-${crypto.randomUUID()}`, planResult.rows[0]?.id],
    );
    const tenantId = tenantResult.rows[0]?.id as string;

    const projectResult = await client.query<{ id: string }>(
      `INSERT INTO projects (tenant_id, name, environment)
       VALUES ($1, 'Test', 'development')
       RETURNING id`,
      [tenantId],
    );
    const projectId = projectResult.rows[0]?.id as string;

    const apiKey = generateApiKey('test');
    const apiKeyResult = await client.query<{ id: string }>(
      `INSERT INTO api_keys (tenant_id, project_id, key_hash, key_prefix, label, scopes)
       VALUES ($1, $2, $3, $4, 'Test key', ARRAY['openai'])
       RETURNING id`,
      [tenantId, projectId, apiKey.keyHash, apiKey.keyPrefix],
    );

    return {
      tenantId,
      projectId,
      apiKeyId: apiKeyResult.rows[0]?.id as string,
      plaintextKey: apiKey.plaintext,
    };
  } finally {
    await client.end();
  }
}

export async function revokeApiKey(apiKeyId: string): Promise<void> {
  const client = new Client({ connectionString: process.env['MIGRATIONS_DATABASE_URL'] });
  await client.connect();
  try {
    await client.query('UPDATE api_keys SET revoked_at = now() WHERE id = $1', [apiKeyId]);
  } finally {
    await client.end();
  }
}
