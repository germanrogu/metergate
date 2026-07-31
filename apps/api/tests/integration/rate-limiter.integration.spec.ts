import { afterAll, describe, expect, it } from 'vitest';
import { consumeRateLimitToken } from '../../src/budgets/rate-limiter';
import { closeRedisClient } from '../../src/redis/redis-client';

function uniqueKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe('rate limiter (integration)', () => {
  afterAll(async () => {
    await closeRedisClient();
  });

  it('allows a request within capacity', async () => {
    const key = uniqueKey('allow');
    expect(await consumeRateLimitToken(key, { capacity: 3, refillPerSecond: 0 })).toBe(true);
  });

  it('blocks once capacity is exhausted', async () => {
    const key = uniqueKey('exhaust');
    const options = { capacity: 2, refillPerSecond: 0 };

    expect(await consumeRateLimitToken(key, options)).toBe(true);
    expect(await consumeRateLimitToken(key, options)).toBe(true);
    expect(await consumeRateLimitToken(key, options)).toBe(false);
  });

  it('refills over time', async () => {
    const key = uniqueKey('refill');
    const options = { capacity: 1, refillPerSecond: 100 };

    expect(await consumeRateLimitToken(key, options)).toBe(true);
    expect(await consumeRateLimitToken(key, options)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await consumeRateLimitToken(key, options)).toBe(true);
  });

  it('tracks separate buckets per key', async () => {
    const options = { capacity: 1, refillPerSecond: 0 };
    const keyA = uniqueKey('a');
    const keyB = uniqueKey('b');

    expect(await consumeRateLimitToken(keyA, options)).toBe(true);
    expect(await consumeRateLimitToken(keyA, options)).toBe(false);
    expect(await consumeRateLimitToken(keyB, options)).toBe(true);
  });
});
