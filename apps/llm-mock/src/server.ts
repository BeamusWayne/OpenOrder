import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });
import { serve } from "@hono/node-server";
import { mockApp } from "./app.js";

const port = Number(process.env.LLM_MOCK_PORT ?? 4010);
serve({ fetch: mockApp.fetch, port }, () => {
  console.log(`llm-mock listening on ${port}`);
});
