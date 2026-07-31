import { Client } from 'pg';
import { generateApiKey } from '../api-keys/api-key.util';

// Runs against MIGRATIONS_DATABASE_URL (the migrator role), not the app
// role — tenant creation is deliberately not exposed through the API
// (see CLAUDE.md), so seeding is the only way tenants get created.
async function seed(): Promise<void> {
  const client = new Client({ connectionString: process.env['MIGRATIONS_DATABASE_URL'] });
  await client.connect();

  try {
    await client.query('BEGIN');

    const planResult = await client.query<{ id: string }>(
      `INSERT INTO plans (name, monthly_budget_usd_micros, rate_limit_per_minute, rate_limit_burst)
       VALUES ('demo', 10000000000, 60, 20)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const planId = planResult.rows[0]?.id;

    const tenantResult = await client.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, plan_id)
       VALUES ('Demo Tenant', 'demo', $1)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [planId],
    );
    const tenantId = tenantResult.rows[0]?.id;

    const projectResult = await client.query<{ id: string }>(
      `INSERT INTO projects (tenant_id, name, environment)
       VALUES ($1, 'Development', 'development')
       RETURNING id`,
      [tenantId],
    );
    const projectId = projectResult.rows[0]?.id;

    const apiKey = generateApiKey('test');
    await client.query(
      `INSERT INTO api_keys (tenant_id, project_id, key_hash, key_prefix, label, scopes)
       VALUES ($1, $2, $3, $4, 'Seed key', ARRAY['openai', 'anthropic'])`,
      [tenantId, projectId, apiKey.keyHash, apiKey.keyPrefix],
    );

    await client.query('COMMIT');

    console.log('Seeded demo tenant.');
    console.log(`tenantId:  ${tenantId}`);
    console.log(`projectId: ${projectId}`);
    console.log(`API key (shown once): ${apiKey.plaintext}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
