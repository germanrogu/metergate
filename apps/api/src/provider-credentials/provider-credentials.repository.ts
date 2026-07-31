import type { Provider } from '../providers/provider-adapter';
import { withTenantTransaction } from '../db/with-tenant-transaction';
import { decryptProviderKey, encryptProviderKey } from './encryption';

interface ProviderCredentialRow {
  encrypted_key: string;
}

// tenant_id is set from current_setting('app.tenant_id'), not passed in
// from the caller — the RLS policy's implicit WITH CHECK independently
// enforces it has to match the active tenant context anyway, so this
// keeps the source of truth in one place instead of two.
export async function storeProviderCredential(provider: Provider, plaintextKey: string): Promise<void> {
  const encryptedKey = encryptProviderKey(plaintextKey);
  const keyLast4 = plaintextKey.slice(-4);

  await withTenantTransaction(async (client) => {
    await client.query(
      `INSERT INTO provider_credentials (tenant_id, provider, encrypted_key, key_last4)
       VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3)
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key, key_last4 = EXCLUDED.key_last4, is_active = true`,
      [provider, encryptedKey, keyLast4],
    );
  });
}

export async function getProviderCredential(provider: Provider): Promise<string | null> {
  return withTenantTransaction(async (client) => {
    const result = await client.query<ProviderCredentialRow>(
      `SELECT encrypted_key FROM provider_credentials WHERE provider = $1 AND is_active = true`,
      [provider],
    );
    const row = result.rows[0];
    return row ? decryptProviderKey(row.encrypted_key) : null;
  });
}
