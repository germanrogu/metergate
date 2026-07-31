import { getPool } from '../db/pool';
import type { Provider } from '../providers/provider-adapter';

export interface ResolvedPricing {
  inputPricePer1kUsdMicros: number;
  outputPricePer1kUsdMicros: number;
}

interface ModelPricingRow {
  input_price_per_1k_usd_micros: string;
  output_price_per_1k_usd_micros: string;
}

// Global catalog, not tenant-scoped: resolves the price that was in
// effect at occurredAt (not "now"), so a later price correction never
// rewrites historical billing for calls that already happened.
export async function resolvePricing(
  provider: Provider,
  modelId: string,
  occurredAt: Date,
): Promise<ResolvedPricing | null> {
  const result = await getPool().query<ModelPricingRow>(
    `SELECT mp.input_price_per_1k_usd_micros, mp.output_price_per_1k_usd_micros
     FROM model_pricing mp
     JOIN models m ON m.id = mp.model_id
     WHERE m.provider = $1
       AND m.model_id = $2
       AND mp.effective_from <= $3
       AND (mp.effective_to IS NULL OR mp.effective_to > $3)`,
    [provider, modelId, occurredAt],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    inputPricePer1kUsdMicros: Number(row.input_price_per_1k_usd_micros),
    outputPricePer1kUsdMicros: Number(row.output_price_per_1k_usd_micros),
  };
}
