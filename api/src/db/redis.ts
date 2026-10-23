import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 100, 1_000)
    })
  : undefined;

export async function closeRedis() {
  if (!redis) return;

  if (redis.status === "ready") {
    await redis.quit();
    return;
  }

  redis.disconnect();
}
