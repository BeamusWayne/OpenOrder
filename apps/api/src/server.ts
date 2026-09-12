import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { redis } from "./rate-limit.js";

await redis.connect().catch(() => undefined);
serve({ fetch: app.fetch, port: env.port }, () => {
  logger.info({ port: env.port }, "api listening");
});
