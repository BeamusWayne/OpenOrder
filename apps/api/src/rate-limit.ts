import Redis from "ioredis";
import { env } from "./env.js";
import { metrics } from "./logger.js";

export const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });

export async function limitChat(customerId: string): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const key = `rate:chat:${customerId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  if (count > env.chatRateLimit) {
    metrics.chatRateLimited += 1;
    const ttl = await redis.ttl(key);
    return { ok: false, retryAfter: Math.max(ttl, 1) };
  }
  return { ok: true };
}
