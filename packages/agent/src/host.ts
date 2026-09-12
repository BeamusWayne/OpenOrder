import { LlmClient } from "@openorder/llm";
import {
  IntentClassificationSchema,
  OPENAI_TOOLS,
  progressSteps,
  type AgentEvent,
  type ChatMessage,
  type IntentClassification,
} from "@openorder/protocol";

const CLASSIFY_SYSTEM =
  "classify OpenOrder intent as JSON with keys intent and reason. intent is ordering, order_followup, or out_of_scope. Only drink ordering, modifier changes, payment, and order status are in scope. Knowledge questions such as Transformer, algorithms, homework, or politics are out_of_scope.";

const ORDER_SYSTEM =
  "You are OpenOrder, a beverage ordering assistant. Use tools to search stores, configure drinks, and prepare checkout. After checkout, stop so the customer can pay in the payment sheet. Never capture payment yourself. Never answer unrelated academic or technical questions.";

const INTERCEPT_MESSAGE = "我只能帮你点饮品、改规格、确认下单或查询已有订单。";
const STREAM_DELAY_MS = process.env.VITEST ? 0 : 16;

export type AgentHostOptions = {
  llm: LlmClient;
  executeTool: (name: string, args: unknown) => Promise<unknown>;
  history?: ChatMessage[];
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OrderSnapshot = {
  orderId: string;
  status: string;
  storeName: string;
  merchantName?: string;
  pickupCode?: string;
  totalCents: number;
  lines?: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    modifiers: string[];
  }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function* emitTyped(text: string): AsyncGenerator<AgentEvent> {
  for (const char of text) {
    yield { type: "token", text: char };
    if (STREAM_DELAY_MS > 0) {
      await sleep(STREAM_DELAY_MS);
    }
  }
}

function needsClarify(text: string, history: ChatMessage[]) {
  if (history.some((row) => row.role === "user")) {
    return false;
  }
  if (/瑞幸|蜜雪|喜茶|奈雪|茶百道|生椰|拿铁|柠檬|珍珠|葡萄|美式|褐糖/.test(text)) {
    return false;
  }
  return /点|喝|奶茶|咖啡|茶/.test(text);
}

function introFor(text: string): string | null {
  if (/查看订单|订单状态|我的订单/.test(text)) {
    return null;
  }
  if (/确认下单|确认并|下单吧/.test(text)) {
    return "正在提交订单，提交后会进入模拟支付。";
  }
  if (/就这家|第一家/.test(text)) {
    return "好，我来看这家店的菜单和规格。";
  }
  if (/点|瑞幸|奶茶|咖啡|蜜雪|喜茶|奈雪|茶百道/.test(text)) {
    return "先帮你找附近的店。";
  }
  return "我来继续处理这杯饮品。";
}

function merchantNameOf(order: OrderSnapshot) {
  return order.merchantName || order.storeName.split(/\s+/)[0] || "商家";
}

function paymentSheet(order: OrderSnapshot) {
  return {
    type: "payment_sheet" as const,
    orderId: order.orderId,
    amountCents: order.totalCents,
    storeName: order.storeName,
    merchantName: merchantNameOf(order),
    pickupCode: order.pickupCode,
    lines: order.lines ?? [],
  };
}

async function* streamOrComplete(
  llm: LlmClient,
  request: Parameters<LlmClient["complete"]>[0],
): AsyncGenerator<AgentEvent, { content: string; toolCalls: ToolCall[] }> {
  const assembled = new Map<number, { id: string; name: string; arguments: string }>();
  let content = "";
  let received = false;

  if (typeof llm.stream === "function") {
    try {
      for await (const chunk of llm.stream(request)) {
        received = true;
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          yield { type: "token", text: delta.content };
        }
        for (const call of delta?.tool_calls ?? []) {
          const current = assembled.get(call.index) ?? { id: "", name: "", arguments: "" };
          if (call.id) {
            current.id = call.id;
          }
          if (call.function?.name) {
            current.name += call.function.name;
          }
          if (call.function?.arguments) {
            current.arguments += call.function.arguments;
          }
          assembled.set(call.index, current);
        }
      }
      const toolCalls = [...assembled.entries()]
        .sort((left, right) => left[0] - right[0])
        .filter(([, call]) => call.name)
        .map(([, call]) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: call.arguments },
        }));
      return { content, toolCalls };
    } catch (error) {
      if (received) {
        throw error;
      }
    }
  }

  const completion = await llm.complete(request);
  const message = completion.choices[0]?.message;
  content = message?.content ?? "";
  if (content) {
    yield* emitTyped(content);
  }
  return { content, toolCalls: (message?.tool_calls ?? []) as ToolCall[] };
}

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
    yield* emitTyped(INTERCEPT_MESSAGE);
    return;
  }

  if (needsClarify(text, history)) {
    yield {
      type: "ui",
      block: {
        type: "clarify",
        prompt: "先确认几杯、糖度、冰量和取餐方式。",
        options: [
          { id: "one-less", label: "一杯少糖去冰", text: "一杯少糖去冰，自取，生椰拿铁" },
          { id: "one-half", label: "一杯半糖少冰", text: "一杯半糖少冰，自取，生椰拿铁" },
          { id: "two-pickup", label: "两杯自取", text: "两杯少糖去冰，自取，生椰拿铁" },
          { id: "delivery", label: "外送", text: "一杯少糖去冰，外送，生椰拿铁" },
        ],
      },
    };
    yield* emitTyped("信息还不全。先选几杯、糖、冰，以及自取还是外送。");
    return;
  }

  const intro = introFor(text);
  if (intro) {
    yield* emitTyped(intro);
  }

  const messages: ChatMessage[] = [
    { role: "system", content: ORDER_SYSTEM },
    ...history,
    { role: "user", content: text },
  ];

  for (let step = 0; step < 8; step += 1) {
    const completion = streamOrComplete(options.llm, {
      messages,
      tools: OPENAI_TOOLS,
      tool_choice: "auto",
    });
    let next = await completion.next();
    while (!next.done) {
      yield next.value;
      next = await completion.next();
    }
    const { content, toolCalls } = next.value;
    if (toolCalls.length === 0) {
      if (!content) {
        return;
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
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code === "sold_out") {
          const rawArgs = (args ?? {}) as { storeId?: string; skuId?: string };
          const suggested = (await options.executeTool("suggest_alternatives", rawArgs)) as {
            itemName?: string;
            alternatives?: Array<{
              kind: "sku" | "store" | "item";
              label: string;
              storeId?: string;
              storeName?: string;
              skuId?: string;
              skuName?: string;
              itemName?: string;
            }>;
          };
          yield {
            type: "ui",
            block: {
              type: "sold_out",
              itemName: suggested.itemName ?? "这杯",
              message: "这杯暂时售罄，可以换杯型、换店或换相似款。",
              alternatives: suggested.alternatives ?? [],
            },
          };
          yield* emitTyped("这杯暂时售罄，可以换杯型、换店或换相似款。");
          return;
        }
        yield {
          type: "error",
          message: error instanceof Error ? error.message : "tool failed",
        };
        return;
      }
      yield { type: "tool_end", name: call.function.name, result };

      if (call.function.name === "search_stores" && Array.isArray(result)) {
        yield { type: "ui", block: { type: "store_list", stores: result } };
        yield* emitTyped("请选择一家门店继续下单。");
        return;
      }

      if (call.function.name === "get_menu" && result && typeof result === "object") {
        const menu = result as {
          storeId?: string;
          items?: Array<{
            id: string;
            name: string;
            skus?: Array<{
              id: string;
              name: string;
              size?: string;
              basePriceCents?: number;
              quantity?: number;
            }>;
            groups?: Array<{
              id: string;
              name: string;
              required: boolean;
              options: Array<{ id: string; name: string; priceDeltaCents: number }>;
            }>;
          }>;
        };
        const item = [...(menu.items ?? [])].sort((left, right) => {
          const groupDelta = (right.groups?.length ?? 0) - (left.groups?.length ?? 0);
          if (groupDelta !== 0) {
            return groupDelta;
          }
          return (right.skus?.length ?? 0) - (left.skus?.length ?? 0);
        })[0];
        if (menu.storeId && item?.id && ((item.groups?.length ?? 0) > 0 || (item.skus?.length ?? 0) > 0)) {
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
          yield* emitTyped("糖、冰和杯型可以改，价格会马上更新。");
        }
      }

      if (call.function.name === "prepare_checkout" && result && typeof result === "object") {
        yield { type: "ui", block: result as never };
        yield* emitTyped("确认后会进入模拟支付，现在还不会扣款。");
        return;
      }

      if (call.function.name === "checkout" && result && typeof result === "object" && "orderId" in result) {
        const order = result as OrderSnapshot;
        yield { type: "ui", block: paymentSheet(order) };
        yield* emitTyped("订单已提交，还没有付款。请选择微信支付或支付宝。");
        return;
      }

      if (call.function.name === "pay_order" && result && typeof result === "object" && "orderId" in result) {
        const order = result as OrderSnapshot;
        yield {
          type: "ui",
          block: {
            type: "pay_receipt",
            orderId: order.orderId,
            amountCents: order.totalCents,
            provider: "mock",
            storeName: order.storeName,
            merchantName: merchantNameOf(order),
            paidAt: new Date().toISOString(),
          },
        };
        yield {
          type: "ui",
          block: {
            type: "order_progress",
            orderId: order.orderId,
            storeName: order.storeName,
            status: order.status,
            steps: progressSteps(order.status),
            pickupCode: order.pickupCode,
          },
        };
        yield* emitTyped("支付已完成。出餐进度会在卡片里更新。");
        return;
      }

      if (call.function.name === "get_order" && result && typeof result === "object" && "orderId" in result) {
        const order = result as OrderSnapshot;
        if (order.status === "draft_confirmed") {
          yield { type: "ui", block: paymentSheet(order) };
          yield* emitTyped("这单还没付。请选择微信支付或支付宝。");
        } else {
          yield {
            type: "ui",
            block: {
              type: "order_progress",
              orderId: order.orderId,
              storeName: order.storeName,
              status: order.status,
              steps: progressSteps(order.status),
              pickupCode: order.pickupCode,
            },
          };
          yield* emitTyped(`当前订单在「${order.storeName}」，状态已同步到进度卡。`);
        }
        return;
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
