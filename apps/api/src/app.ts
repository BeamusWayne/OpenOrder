import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { eq } from "drizzle-orm";
import { createDb, messages, threads } from "@openorder/db";
import { DomainError, Ordering } from "@openorder/domain";
import { LlmClient } from "@openorder/llm";
import { runTurn } from "@openorder/agent";
import { createToolRouter } from "@openorder/tools";
import type { AgentEvent, ChatMessage } from "@openorder/protocol";
import { requireAuth, signCustomer } from "./auth.js";
import { env } from "./env.js";
import { logger, metrics, renderMetrics } from "./logger.js";
import { limitChat, redis } from "./rate-limit.js";

export const db = createDb(env.databaseUrl);
export const ordering = new Ordering(db);
const llm = new LlmClient({
  baseURL: env.openaiBaseUrl,
  apiKey: env.openaiApiKey,
  model: env.openaiModel,
});

export const app = new Hono();
app.use("*", cors());

app.onError((error, context) => {
  if (error instanceof DomainError) {
    return context.json({ error: error.code, message: error.message }, error.status as 400);
  }
  logger.error({ err: error }, "unhandled");
  return context.json({ error: "internal", message: error.message }, 500);
});

app.get("/health", async (context) => {
  await redis.ping();
  return context.json({ ok: true, service: "api" });
});

app.get("/metrics", (context) => {
  context.header("content-type", "text/plain; version=0.0.4");
  return context.body(renderMetrics());
});

app.post("/v1/auth/guest", async (context) => {
  const customer = await ordering.createGuest();
  const token = await signCustomer(customer.id);
  return context.json({ token, customer });
});

const authed = new Hono<{ Variables: { customerId: string } }>();
authed.use("*", requireAuth);

authed.post("/v1/carts", async (context) => {
  const body = await context.req.json<{
    storeId: string;
    skuId: string;
    quantity?: number;
    modifierIds?: string[];
  }>();
  return context.json(
    await ordering.addCartItem({
      customerId: context.get("customerId"),
      storeId: body.storeId,
      skuId: body.skuId,
      quantity: body.quantity ?? 1,
      modifierIds: body.modifierIds ?? [],
    }),
  );
});

authed.patch("/v1/carts/:id", async (context) => {
  const body = await context.req.json<{
    skuId: string;
    modifierIds?: string[];
    quantity?: number;
  }>();
  return context.json(
    await ordering.configureCart({
      customerId: context.get("customerId"),
      cartId: context.req.param("id"),
      skuId: body.skuId,
      modifierIds: body.modifierIds ?? [],
      quantity: body.quantity ?? 1,
    }),
  );
});

authed.get("/v1/stores", async (context) => {
  const query = context.req.query("q") ?? "饮品";
  return context.json(await ordering.searchStores({ query }));
});

authed.get("/v1/stores/:id/menu", async (context) => {
  return context.json(await ordering.getMenu(context.req.param("id"), context.req.query("item")));
});

authed.get("/v1/orders", async (context) => {
  return context.json(await ordering.listOrders(context.get("customerId")));
});

authed.get("/v1/orders/:id", async (context) => {
  return context.json(await ordering.getOrder(context.req.param("id"), context.get("customerId")));
});

authed.post("/v1/orders/:id/pay", async (context) => {
  const body = await context.req.json<{ provider?: string }>().catch(() => ({ provider: "mock" }));
  const provider =
    body.provider === "wechat" || body.provider === "alipay" || body.provider === "mock"
      ? body.provider
      : "mock";
  const order = await ordering.pay(context.req.param("id"), context.get("customerId"), provider);
  return context.json(order);
});

authed.post("/v1/orders/:id/advance", async (context) => {
  return context.json(
    await ordering.advanceFulfillment(context.req.param("id"), context.get("customerId")),
  );
});

authed.post("/v1/checkout", async (context) => {
  const idempotencyKey = context.req.header("idempotency-key");
  if (!idempotencyKey) {
    return context.json({ error: "missing_idempotency_key" }, 400);
  }
  const body = await context.req.json<{ cartId: string }>();
  try {
    const order = await ordering.checkout({
      customerId: context.get("customerId"),
      cartId: body.cartId,
      idempotencyKey,
      confirmed: true,
    });
    metrics.checkoutSucceeded += 1;
    return context.json(order);
  } catch (error) {
    metrics.checkoutFailed += 1;
    throw error;
  }
});

authed.post("/v1/threads", async (context) => {
  const [thread] = await db
    .insert(threads)
    .values({ customerId: context.get("customerId") })
    .returning();
  return context.json(thread);
});

authed.post("/v1/threads/:id/messages", async (context) => {
  const customerId = context.get("customerId");
  const limited = await limitChat(customerId);
  if (!limited.ok) {
    context.header("retry-after", String(limited.retryAfter));
    return context.json({ error: "rate_limited" }, 429);
  }

  const threadId = context.req.param("id");
  const thread = await db.query.threads.findFirst({ where: eq(threads.id, threadId) });
  if (!thread || thread.customerId !== customerId) {
    return context.json({ error: "not_found" }, 404);
  }

  const body = await context.req.json<{ text: string }>();
  await db.insert(messages).values({ threadId, role: "user", content: body.text });
  const historyRows = await db.select().from(messages).where(eq(messages.threadId, threadId));
  const history = historyRows
    .filter((row) => row.id)
    .slice(0, -1)
    .map((row) => ({
      role: row.role as ChatMessage["role"],
      content: row.content,
      name: row.name ?? undefined,
      tool_call_id: row.toolCallId ?? undefined,
    }));

  const executeTool = createToolRouter(ordering, {
    customerId,
    threadId,
    confirmed: false,
  });

  metrics.chatAccepted += 1;
  return streamSSE(context, async (stream) => {
    await writeAgentStream(stream, threadId, runTurn(body.text, { llm, executeTool, history }), {
      onEvent: (event) => {
        if (event.type === "intent" && event.intent === "out_of_scope") {
          metrics.chatIntercepted += 1;
        }
      },
    });
  });
});

authed.post("/v1/threads/:id/confirm", async (context) => {
  const customerId = context.get("customerId");
  const threadId = context.req.param("id");
  const thread = await db.query.threads.findFirst({ where: eq(threads.id, threadId) });
  if (!thread || thread.customerId !== customerId) {
    return context.json({ error: "not_found" }, 404);
  }
  const body = await context.req.json<{ cartId?: string }>().catch(() => ({ cartId: "" }));
  const cartId = typeof body.cartId === "string" ? body.cartId.trim() : "";
  const text = cartId ? `确认下单 cartId=${cartId}` : "确认下单";
  await db.insert(messages).values({ threadId, role: "user", content: text });
  const historyRows = await db.select().from(messages).where(eq(messages.threadId, threadId));
  const history = historyRows
    .slice(0, -1)
    .map((row) => ({
      role: row.role as ChatMessage["role"],
      content: row.content,
      name: row.name ?? undefined,
      tool_call_id: row.toolCallId ?? undefined,
    }));
  const executeTool = createToolRouter(ordering, {
    customerId,
    threadId,
    confirmed: true,
  });
  return streamSSE(context, async (stream) => {
    await writeAgentStream(stream, threadId, runTurn(text, { llm, executeTool, history }));
  });
});

app.route("/", authed);

async function writeAgentStream(
  stream: { writeSSE: (message: { event?: string; data: string }) => Promise<void> },
  threadId: string,
  events: AsyncIterable<AgentEvent>,
  options?: { onEvent?: (event: AgentEvent) => void },
) {
  let tokenBuffer = "";
  const flushTokens = async () => {
    if (!tokenBuffer) {
      return;
    }
    await db.insert(messages).values({ threadId, role: "assistant", content: tokenBuffer });
    tokenBuffer = "";
  };
  for await (const event of events) {
    options?.onEvent?.(event);
    if (event.type === "token") {
      tokenBuffer += event.text;
    } else {
      await flushTokens();
      await persistEvent(threadId, event);
    }
    await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
  }
  await flushTokens();
  await stream.writeSSE({
    event: "done",
    data: JSON.stringify({ type: "done", threadId }),
  });
}

async function persistEvent(threadId: string, event: AgentEvent) {
  if (event.type === "tool_end") {
    await db.insert(messages).values({
      threadId,
      role: "tool",
      name: event.name,
      content: JSON.stringify(event.result),
    });
  }
}
