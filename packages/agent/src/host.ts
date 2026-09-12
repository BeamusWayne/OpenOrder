import { LlmClient } from "@openorder/llm";
import {
  IntentClassificationSchema,
  OPENAI_TOOLS,
  type AgentEvent,
  type ChatMessage,
  type IntentClassification,
} from "@openorder/protocol";

const CLASSIFY_SYSTEM =
  "classify OpenOrder intent as JSON with keys intent and reason. intent is ordering, order_followup, or out_of_scope. Only drink ordering, modifier changes, payment, and order status are in scope. Knowledge questions such as Transformer, algorithms, homework, or politics are out_of_scope.";

const ORDER_SYSTEM =
  "You are OpenOrder, a beverage ordering assistant. Use tools to search stores, configure drinks, confirm, checkout, and pay. Never answer unrelated academic or technical questions.";

const INTERCEPT_MESSAGE = "我只能帮你点饮品、改规格、确认下单或查询已有订单。";

export type AgentHostOptions = {
  llm: LlmClient;
  executeTool: (name: string, args: unknown) => Promise<unknown>;
  history?: ChatMessage[];
};

export async function classifyIntent(
  llm: LlmClient,
  text: string,
  history: ChatMessage[] = [],
): Promise<IntentClassification> {
  const response = await llm.complete({
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      ...history.slice(-6),
      { role: "user", content: text },
    ],
  });
  return IntentClassificationSchema.parse(JSON.parse(response.choices[0]?.message.content ?? "{}"));
}

export async function* runTurn(
  text: string,
  options: AgentHostOptions,
): AsyncGenerator<AgentEvent> {
  const history = options.history ?? [];
  const classification = await classifyIntent(options.llm, text, history);
  yield { type: "intent", intent: classification.intent, reason: classification.reason };

  if (classification.intent === "out_of_scope") {
    yield {
      type: "ui",
      block: { type: "intercept", message: INTERCEPT_MESSAGE },
    };
    yield { type: "token", text: INTERCEPT_MESSAGE };
    return;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: ORDER_SYSTEM },
    ...history,
    { role: "user", content: text },
  ];

  for (let step = 0; step < 8; step += 1) {
    const completion = await options.llm.complete({
      messages,
      tools: OPENAI_TOOLS,
      tool_choice: "auto",
    });
    const choice = completion.choices[0];
    const toolCalls = choice?.message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const content = choice?.message.content ?? "";
      if (content) {
        yield { type: "token", text: content };
      }
      return;
    }

    messages.push({
      role: "assistant",
      content: null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments || "{}") as unknown;
      yield { type: "tool_start", name: call.function.name, arguments: args };
      let result: unknown;
      try {
        result = await options.executeTool(call.function.name, args);
      } catch (error) {
        yield {
          type: "error",
          message: error instanceof Error ? error.message : "tool failed",
        };
        return;
      }
      yield { type: "tool_end", name: call.function.name, result };
      if (call.function.name === "search_stores" && Array.isArray(result)) {
        yield { type: "token", text: "请选择一家门店继续下单。" };
        yield { type: "ui", block: { type: "store_list", stores: result } };
        return;
      }
      if (call.function.name === "get_menu" && result && typeof result === "object") {
        const menu = result as {
          storeId?: string;
          items?: Array<{
            id: string;
            name: string;
            skus?: Array<{ id: string; name: string; size?: string; basePriceCents?: number; quantity?: number }>;
            groups?: Array<{
              id: string;
              name: string;
              required: boolean;
              options: Array<{ id: string; name: string; priceDeltaCents: number }>;
            }>;
          }>;
        };
        const item = menu.items?.[0];
        if (item?.id && ((item.groups?.length ?? 0) > 0 || (item.skus?.length ?? 0) > 0)) {
          yield {
            type: "ui",
            block: {
              type: "modifier_picker",
              storeId: menu.storeId,
              itemId: item.id,
              itemName: item.name,
              skuId: item.skus?.[0]?.id ?? item.id,
              skus: item.skus ?? [],
              groups: item.groups ?? [],
            },
          };
        }
      }
      if (call.function.name === "prepare_checkout" && result && typeof result === "object") {
        yield { type: "ui", block: result as never };
        return;
      }
      if (call.function.name === "checkout" && result && typeof result === "object" && "orderId" in result) {
        const order = result as { orderId: string; totalCents: number };
        yield {
          type: "ui",
          block: {
            type: "payment",
            orderId: order.orderId,
            amountCents: order.totalCents,
            provider: "mock",
          },
        };
      }
      if (call.function.name === "pay_order" && result && typeof result === "object" && "orderId" in result) {
        const order = result as { orderId: string; status: string; storeName: string };
        yield {
          type: "ui",
          block: {
            type: "order_status",
            orderId: order.orderId,
            status: order.status,
            storeName: order.storeName,
          },
        };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }
}
