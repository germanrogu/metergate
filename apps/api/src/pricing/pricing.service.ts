import type { ResolvedPricing } from './pricing.repository';

// Cost is always an integer number of USD micros — rounding once here,
// at the point cost is computed, is what keeps it an integer everywhere
// downstream (usage_events, invoices) instead of accumulating float
// drift across a chain of arithmetic.
export function calculateCostUsdMicros(
  inputTokens: number,
  outputTokens: number,
  pricing: ResolvedPricing,
): number {
  const inputCost = (inputTokens / 1000) * pricing.inputPricePer1kUsdMicros;
  const outputCost = (outputTokens / 1000) * pricing.outputPricePer1kUsdMicros;
  return Math.round(inputCost + outputCost);
}
