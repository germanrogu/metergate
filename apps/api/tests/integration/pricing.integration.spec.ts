import { afterAll, describe, expect, it } from 'vitest';
import { getPool } from '../../src/db/pool';
import { resolvePricing } from '../../src/pricing/pricing.repository';

describe('pricing repository (integration)', () => {
  afterAll(async () => {
    await getPool().end();
  });

  it('resolves the seeded price for a known model', async () => {
    const pricing = await resolvePricing('openai', 'gpt-4o-mini', new Date());

    expect(pricing).toEqual({ inputPricePer1kUsdMicros: 150_000, outputPricePer1kUsdMicros: 600_000 });
  });

  it('returns null for an unknown model', async () => {
    const pricing = await resolvePricing('openai', 'does-not-exist', new Date());

    expect(pricing).toBeNull();
  });
});
