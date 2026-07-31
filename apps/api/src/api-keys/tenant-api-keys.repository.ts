import { withTenantTransaction } from '../db/with-tenant-transaction';
import type { CallerProvider } from '../providers/provider-adapter.factory';
import { generateApiKey } from './api-key.util';

export interface TenantApiKey {
  id: string;
  keyPrefix: string;
  label: string;
  scopes: string[];
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

interface TenantApiKeyRow {
  id: string;
  key_prefix: string;
  label: string;
  scopes: string[];
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

function toTenantApiKey(row: TenantApiKeyRow): TenantApiKey {
  return {
    id: row.id,
    keyPrefix: row.key_prefix,
    label: row.label,
    scopes: row.scopes,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export interface CreateApiKeyForTenantInput {
  label: string;
  scopes: CallerProvider[];
}

export interface CreateApiKeyOverrides {
  label?: string | undefined;
  scopes?: CallerProvider[] | undefined;
}

export interface CreatedTenantApiKey extends TenantApiKey {
  plaintextKey: string;
}

// Always creates a "live" key here — the tenant is managing their own
// production keys through this endpoint, not seeding a test fixture.
export async function createApiKeyForTenant(input: CreateApiKeyForTenantInput): Promise<CreatedTenantApiKey> {
  const generated = generateApiKey('live');

  return withTenantTransaction(async (client) => {
    const projectResult = await client.query<{ id: string }>(
      `SELECT id FROM projects WHERE tenant_id = current_setting('app.tenant_id')::uuid ORDER BY created_at ASC LIMIT 1`,
    );
    const projectId = projectResult.rows[0]?.id;
    if (!projectId) {
      throw new Error('Tenant has no project to attach the new API key to');
    }

    const result = await client.query<TenantApiKeyRow>(
      `INSERT INTO api_keys (tenant_id, project_id, key_hash, key_prefix, label, scopes)
       VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)
       RETURNING id, key_prefix, label, scopes, revoked_at, last_used_at, created_at`,
      [projectId, generated.keyHash, generated.keyPrefix, input.label, input.scopes],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create API key');
    }

    return { ...toTenantApiKey(row), plaintextKey: generated.plaintext };
  });
}

export async function listApiKeysForTenant(): Promise<TenantApiKey[]> {
  return withTenantTransaction(async (client) => {
    const result = await client.query<TenantApiKeyRow>(
      `SELECT id, key_prefix, label, scopes, revoked_at, last_used_at, created_at
       FROM api_keys
       ORDER BY created_at DESC`,
    );
    return result.rows.map(toTenantApiKey);
  });
}

export async function getApiKeyForTenant(id: string): Promise<TenantApiKey | null> {
  return withTenantTransaction(async (client) => {
    const result = await client.query<TenantApiKeyRow>(
      `SELECT id, key_prefix, label, scopes, revoked_at, last_used_at, created_at
       FROM api_keys
       WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toTenantApiKey(row) : null;
  });
}

// effectiveAt in the future is what makes a grace period possible —
// ApiKeyGuard treats a revocation as active only once it's actually
// arrived (see auth/api-key.guard.ts), not the instant this is called.
export async function revokeApiKeyAt(id: string, effectiveAt: Date): Promise<void> {
  await withTenantTransaction(async (client) => {
    await client.query('UPDATE api_keys SET revoked_at = $2 WHERE id = $1', [id, effectiveAt]);
  });
}

const DEFAULT_ROTATION_GRACE_HOURS = 24;

export interface RotateApiKeyResult {
  newKey: CreatedTenantApiKey;
  oldKeyRevokedAt: Date;
}

// Issues a replacement key immediately, but the old one keeps working
// for gracePeriodHours — a hard, instant cutover would break any
// client mid-flight still holding the old key; this gives them a
// window to pick up the new one.
export async function rotateApiKey(
  oldKeyId: string,
  overrides: CreateApiKeyOverrides = {},
  graceHours: number = DEFAULT_ROTATION_GRACE_HOURS,
): Promise<RotateApiKeyResult> {
  const existing = await getApiKeyForTenant(oldKeyId);
  if (!existing) {
    throw new Error(`API key ${oldKeyId} not found for this tenant`);
  }

  const newKey = await createApiKeyForTenant({
    label: overrides.label ?? `${existing.label} (rotated)`,
    scopes: (overrides.scopes ?? existing.scopes) as CallerProvider[],
  });

  const oldKeyRevokedAt = new Date(Date.now() + graceHours * 60 * 60 * 1000);
  await revokeApiKeyAt(oldKeyId, oldKeyRevokedAt);

  return { newKey, oldKeyRevokedAt };
}
