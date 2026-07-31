import { getPool } from '../db/pool';

export interface ResolvedApiKey {
  id: string;
  tenantId: string;
  projectId: string;
  scopes: string[];
  revokedAt: Date | null;
}

interface ResolveGatewayApiKeyRow {
  id: string;
  tenant_id: string;
  project_id: string;
  scopes: string[];
  revoked_at: Date | null;
}

// Goes through the resolve_gateway_api_key() SECURITY DEFINER function
// rather than a plain SELECT, because this lookup runs before we know
// the tenant, so it can't go through the normal RLS-scoped path.
export async function resolveApiKeyByHash(keyHash: string): Promise<ResolvedApiKey | null> {
  const result = await getPool().query<ResolveGatewayApiKeyRow>(
    'SELECT * FROM resolve_gateway_api_key($1)',
    [keyHash],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    scopes: row.scopes,
    revokedAt: row.revoked_at,
  };
}

export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
  await getPool().query('SELECT touch_gateway_api_key($1)', [apiKeyId]);
}
