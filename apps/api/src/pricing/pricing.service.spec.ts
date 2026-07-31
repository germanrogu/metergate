import { describe, expect, it } from 'vitest';
import { calculateCostUsdMicros } from './pricing.service';

const PRICING = { inputPricePer1kUsdMicros: 150_000, outputPricePer1kUsdMicros: 600_000 };

describe('calculateCostUsdMicros', () => {
  it('computes cost proportional to tokens per thousand', () => {
    expect(calculateCostUsdMicros(1000, 1000, PRICING)).toBe(150_000 + 600_000);
  });

  it('rounds to the nearest integer micro', () => {
    expect(calculateCostUsdMicros(1, 0, PRICING)).toBe(Math.round(150_000 / 1000));
  });

  it('returns zero for zero tokens', () => {
    expect(calculateCostUsdMicros(0, 0, PRICING)).toBe(0);
  });
});
