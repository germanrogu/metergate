import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '../../src/db/pool';
import { runWithTenantContext } from '../../src/middleware/tenant-context';
import {
  getProviderCredential,
  storeProviderCredential,
} from '../../src/provider-credentials/provider-credentials.repository';
import { seedTenant } from '../helpers/seed-tenant';

describe('provider credentials (integration)', () => {
  afterAll(async () => {
    await getPool().end();
  });

  it('stores and retrieves a BYOK key scoped to the tenant', async () => {
    const tenant = await seedTenant();

    await runWithTenantContext(tenant.tenantId, async () => {
      await storeProviderCredential('openai', 'sk-test-real-key-12345');
      const retrieved = await getProviderCredential('openai');
      expect(retrieved).toBe('sk-test-real-key-12345');
    });
  });

  it('does not leak a credential across tenants', async () => {
    const tenantA = await seedTenant();
    const tenantB = await seedTenant();

    await runWithTenantContext(tenantA.tenantId, async () => {
      await storeProviderCredential('anthropic', 'sk-ant-tenant-a-secret');
    });

    await runWithTenantContext(tenantB.tenantId, async () => {
      const retrieved = await getProviderCredential('anthropic');
      expect(retrieved).toBeNull();
    });
  });
});
