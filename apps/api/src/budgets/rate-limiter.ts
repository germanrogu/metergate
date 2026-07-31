import type { Redis } from 'ioredis';
import { getRedisClient } from '../redis/redis-client';

// Classic token bucket, done atomically in one round trip so concurrent
// requests can't race a GET-then-SET into over-admitting. Refills
// continuously (not per fixed window), which is how OpenAI/Anthropic
// communicate their own RPM/TPM limits — it tolerates bursts naturally
// instead of penalizing a request that lands right after a window
// boundary.
const TOKEN_BUCKET_SCRIPT = `
local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'timestamp')
local tokens = tonumber(bucket[1])
local timestamp = tonumber(bucket[2])
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

if tokens == nil then
  tokens = capacity
  timestamp = now
end

local elapsedSeconds = math.max(0, now - timestamp) / 1000
local filled = math.min(capacity, tokens + (elapsedSeconds * refillRate))

local allowed = 0
local newTokens = filled
if filled >= requested then
  allowed = 1
  newTokens = filled - requested
end

redis.call('HMSET', KEYS[1], 'tokens', newTokens, 'timestamp', now)
redis.call('EXPIRE', KEYS[1], 3600)

return allowed
`;

interface TokenBucketRedis extends Redis {
  tokenBucket(key: string, capacity: number, refillRate: number, now: number, requested: number): Promise<number>;
}

function getClient(): TokenBucketRedis {
  const client = getRedisClient() as TokenBucketRedis;
  if (typeof client.tokenBucket !== 'function') {
    client.defineCommand('tokenBucket', { numberOfKeys: 1, lua: TOKEN_BUCKET_SCRIPT });
  }
  return client;
}

export interface RateLimitOptions {
  capacity: number;
  refillPerSecond: number;
}

export async function consumeRateLimitToken(
  key: string,
  options: RateLimitOptions,
  requested = 1,
): Promise<boolean> {
  const result = await getClient().tokenBucket(
    `ratelimit:${key}`,
    options.capacity,
    options.refillPerSecond,
    Date.now(),
    requested,
  );
  return result === 1;
}
