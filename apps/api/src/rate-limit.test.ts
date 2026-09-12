import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "./env.js";
import { limitChat, redis } from "./rate-limit.js";

describe("Redis chat rate limit", () => {
  const customerId = `rate-test-${Date.now()}`;

  beforeAll(async () => {
    await redis.connect().catch(() => undefined);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("rejects the turn after the per-minute quota", async () => {
    env.chatRateLimit = 3;
    await redis.del(`rate:chat:${customerId}`);
    expect((await limitChat(customerId)).ok).toBe(true);
    expect((await limitChat(customerId)).ok).toBe(true);
    expect((await limitChat(customerId)).ok).toBe(true);
    const blocked = await limitChat(customerId);
    expect(blocked.ok).toBe(false);
  });
});
