import type { PoolClient } from 'pg';
import { getTenantId } from '../middleware/tenant-context';
import { getPool } from './pool';

// The provider call to the LLM never happens inside this — it can take
// 30-60s under streaming, and a transaction has to stay short. Callers
// invoke this only around the DB write that follows a completed (or
// cut-short) call.
export async function withTenantTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const tenantId = getTenantId();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
