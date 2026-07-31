import { withTenantTransaction } from '../db/with-tenant-transaction';

export interface UnbilledUsageEvent {
  id: string;
  costUsdMicros: number;
}

interface UnbilledUsageEventRow {
  id: string;
  cost_usd_micros: string;
}

const DEFAULT_LIMIT = 100;

export async function getUnbilledUsageEvents(limit: number = DEFAULT_LIMIT): Promise<UnbilledUsageEvent[]> {
  return withTenantTransaction(async (client) => {
    const result = await client.query<UnbilledUsageEventRow>(
      `SELECT id, cost_usd_micros FROM usage_events
       WHERE status = 'success' AND cost_usd_micros IS NOT NULL AND billed_at IS NULL
       ORDER BY occurred_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({ id: row.id, costUsdMicros: Number(row.cost_usd_micros) }));
  });
}

export async function markUsageEventsBilled(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  await withTenantTransaction(async (client) => {
    await client.query('UPDATE usage_events SET billed_at = now() WHERE id = ANY($1)', [ids]);
  });
}
