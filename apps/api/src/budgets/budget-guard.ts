import { getRedisClient } from '../redis/redis-client';

const SECONDS_PER_DAY = 24 * 60 * 60;
const KEY_TTL_SECONDS = 40 * SECONDS_PER_DAY; // comfortably outlives a calendar month

function currentPeriodKey(tenantId: string): string {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `budget:${tenantId}:${period}`;
}

// Mirrors a payment authorization hold: reserve the estimated cost
// before doing the expensive/uncertain work, true it up against the
// real cost afterward. Postgres (usage_events) stays the source of
// truth for what was actually spent — this Redis counter is a fast,
// best-effort gate that a periodic reconciliation job would need to
// correct after a Redis restart. That job isn't built yet; documented
// here rather than silently assumed to exist.
export async function reserveBudget(
  tenantId: string,
  estimatedCostUsdMicros: number,
  limitUsdMicros: number,
): Promise<boolean> {
  const key = currentPeriodKey(tenantId);
  const client = getRedisClient();

  const newTotal = await client.incrby(key, estimatedCostUsdMicros);
  await client.expire(key, KEY_TTL_SECONDS);

  if (newTotal > limitUsdMicros) {
    await client.decrby(key, estimatedCostUsdMicros);
    return false;
  }

  return true;
}

export async function reconcileBudget(
  tenantId: string,
  estimatedCostUsdMicros: number,
  actualCostUsdMicros: number,
): Promise<void> {
  const delta = actualCostUsdMicros - estimatedCostUsdMicros;
  if (delta === 0) {
    return;
  }
  await getRedisClient().incrby(currentPeriodKey(tenantId), delta);
}

export async function getCurrentSpendUsdMicros(tenantId: string): Promise<number> {
  const value = await getRedisClient().get(currentPeriodKey(tenantId));
  return value ? Number(value) : 0;
}
