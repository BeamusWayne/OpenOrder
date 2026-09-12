import { randomUUID } from "node:crypto";
import {
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  IntentClassificationSchema,
  type ChatCompletionChunk,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from "@openorder/protocol";
import { IDS } from "@openorder/simulator";

const OUT_OF_SCOPE =
  /transformer|注意力机制|量子|相对论|写一篇|写代码|python|golang|高考|微积分|政治|原理|什么是大模型|解释一下(?!.*糖|.*冰|.*杯)/i;
const ORDERING =
  /点|下单|奶茶|咖啡|瑞幸|蜜雪|喜茶|奈雪|茶百道|生椰|拿铁|柠檬水|珍珠|葡萄|少糖|去冰|半糖|一杯|两杯|外卖|自取/;
const FOLLOWUP = /确认|付款|支付|就这家|第一家|少糖|去冰|半糖|少冰|正常冰|标准糖|全糖|中杯|大杯|规格|改成|好的|下单吧|买|查看订单|订单状态|我的订单|换成|换店|换一家|再加一杯|再来一杯/;

function lastUserText(request: ChatCompletionRequest): string {
  const users = request.messages.filter((message) => message.role === "user");
  return users.at(-1)?.content ?? "";
}

function allUserText(request: ChatCompletionRequest): string {
  return request.messages
    .filter((message) => message.role === "user" && message.content)
    .map((message) => message.content)
    .join("\n");
}

function extractUuid(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`${key}[=:：]\\s*([0-9a-f-]{36})`, "i"));
  return match?.[1];
}

function extractStoreId(request: ChatCompletionRequest): string | undefined {
  for (const message of [...request.messages].reverse()) {
    const content = typeof message.content === "string" ? message.content : "";
    const keyed = extractUuid(content, "storeId");
    if (keyed) {
      return keyed;
    }
  }
  for (const message of [...request.messages].reverse()) {
    if (message.role !== "user" || typeof message.content !== "string") {
      continue;
    }
    if (/新天地/.test(message.content)) {
      return IDS.stores.luckinXintiandi;
    }
    if (/南京西路/.test(message.content)) {
      return IDS.stores.luckinNanjing;
    }
  }
  return undefined;
}

function pickSku(storeId: string, user: string): string {
  if (storeId === IDS.stores.luckinXintiandi) {
    return IDS.skus.coconutLatteXintiandi;
  }
  if (storeId === IDS.stores.mixuePeople || storeId === IDS.stores.mixueYangpu) {
    return /柠檬/.test(user) ? IDS.skus.lemonWaterLarge : IDS.skus.iceCreamTeaMedium;
  }
  if (storeId === IDS.stores.chabaidaoJingan) {
    return IDS.skus.brownSugarLarge;
  }
  if (storeId === IDS.stores.heyteaLujiazui) {
    return IDS.skus.cheeseTeaMedium;
  }
  if (storeId === IDS.stores.nayukiXujiahui) {
    return IDS.skus.grapeSnowMedium;
  }
  if (/美式/.test(user)) {
    return IDS.skus.americanMedium;
  }
  if (/超大/.test(user)) {
    return IDS.skus.soldOutLatte;
  }
  return IDS.skus.coconutLatteMedium;
}

function pickModifiers(storeId: string, user: string): string[] {
  if (storeId !== IDS.stores.luckinNanjing) {
    return [];
  }
  const sugar = /半糖/.test(user)
    ? IDS.modifiers.sugarHalf
    : /标准糖|全糖/.test(user)
      ? IDS.modifiers.sugarFull
      : IDS.modifiers.sugarLess;
  const ice = /少冰/.test(user)
    ? IDS.modifiers.iceLess
    : /正常冰/.test(user)
      ? IDS.modifiers.iceNormal
      : IDS.modifiers.iceNone;
  return [sugar, ice];
}

function toolNames(request: ChatCompletionRequest): string[] {
  return request.messages
    .filter((message) => message.role === "tool" && message.name)
    .map((message) => message.name as string);
}

function isClassify(request: ChatCompletionRequest): boolean {
  const system = request.messages.find((message) => message.role === "system")?.content ?? "";
  return request.response_format?.type === "json_object" || /classify OpenOrder intent/i.test(system);
}

function classify(text: string): { intent: "ordering" | "order_followup" | "out_of_scope"; reason: string } {
  if (OUT_OF_SCOPE.test(text) && !ORDERING.test(text)) {
    return { intent: "out_of_scope", reason: "The turn is a knowledge question, not an order." };
  }
  if (ORDERING.test(text)) {
    return { intent: "ordering", reason: "The turn asks to buy a drink." };
  }
  if (FOLLOWUP.test(text)) {
    return { intent: "order_followup", reason: "The turn continues an existing order." };
  }
  return { intent: "out_of_scope", reason: "The turn is outside ordering and order tracking." };
}

function completion(params: {
  model: string;
  content?: string | null;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  finish?: "stop" | "tool_calls";
}): ChatCompletionResponse {
  const toolCalls = params.toolName
    ? [
        {
          id: `call_${randomUUID().slice(0, 8)}`,
          type: "function" as const,
          function: {
            name: params.toolName,
            arguments: JSON.stringify(params.toolArguments ?? {}),
          },
        },
      ]
    : undefined;
  return ChatCompletionResponseSchema.parse({
    id: `chatcmpl_${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [
      {
        index: 0,
        finish_reason: params.finish ?? (toolCalls ? "tool_calls" : "stop"),
        message: {
          role: "assistant",
          content: toolCalls ? null : (params.content ?? ""),
          tool_calls: toolCalls,
        },
      },
    ],
    usage: {
      prompt_tokens: 24,
      completion_tokens: 18,
      total_tokens: 42,
    },
  });
}

function chunkText(text: string, size = 2): string[] {
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    parts.push(text.slice(index, index + size));
  }
  return parts.filter((part) => part.length > 0);
}

function nextOrderingTool(request: ChatCompletionRequest): ChatCompletionResponse {
  const names = toolNames(request);
  const user = lastUserText(request);
  const spoken = allUserText(request);
  const storeId = extractStoreId(request) ?? IDS.stores.luckinNanjing;
  if (/查看订单|订单状态|我的订单/.test(user)) {
    return completion({
      model: request.model,
      toolName: "get_order",
      toolArguments: { orderId: extractOrderId(request) },
    });
  }
  if (/换店|换一家/.test(user) && !/就这家/.test(user)) {
    return completion({
      model: request.model,
      toolName: "search_stores",
      toolArguments: {
        query: user || "瑞幸",
        brand: /蜜雪/.test(spoken) ? "蜜雪冰城" : "瑞幸咖啡",
        item: /柠檬/.test(spoken) ? "柠檬水" : "生椰拿铁",
      },
    });
  }
  if (/换成|换杯|换相似|再加一杯|再来一杯/.test(user)) {
    if (names.at(-1) !== "add_cart_item") {
      return completion({
        model: request.model,
        toolName: "add_cart_item",
        toolArguments: {
          storeId,
          skuId: extractSkuId(request) ?? pickSku(storeId, spoken),
          quantity: 1,
          modifierIds: pickModifiers(storeId, spoken),
        },
      });
    }
    return completion({
      model: request.model,
      toolName: "prepare_checkout",
      toolArguments: { cartId: extractCartId(request) },
    });
  }
  if (!names.includes("search_stores")) {
    return completion({
      model: request.model,
      toolName: "search_stores",
      toolArguments: {
        query: user || "瑞幸",
        brand: /蜜雪/.test(spoken) ? "蜜雪冰城" : /喜茶/.test(spoken) ? "喜茶" : /奈雪/.test(spoken) ? "奈雪的茶" : /茶百道/.test(spoken) ? "茶百道" : "瑞幸咖啡",
        item: /柠檬/.test(spoken) ? "柠檬水" : /美式/.test(spoken) ? "美式咖啡" : "生椰拿铁",
      },
    });
  }
  if (!names.includes("get_menu")) {
    return completion({
      model: request.model,
      toolName: "get_menu",
      toolArguments: {
        storeId,
        itemQuery: /柠檬/.test(spoken) ? "柠檬水" : /美式/.test(spoken) ? "美式咖啡" : "生椰拿铁",
      },
    });
  }
  if (!names.includes("add_cart_item")) {
    return completion({
      model: request.model,
      toolName: "add_cart_item",
      toolArguments: {
        storeId,
        skuId: extractSkuId(request) ?? pickSku(storeId, spoken),
        quantity: 1,
        modifierIds: pickModifiers(storeId, spoken),
      },
    });
  }
  if (!names.includes("prepare_checkout")) {
    return completion({
      model: request.model,
      toolName: "prepare_checkout",
      toolArguments: { cartId: extractCartId(request) },
    });
  }
  if (/确认|下单吧|好的/.test(user) && !names.includes("checkout")) {
    return completion({
      model: request.model,
      toolName: "checkout",
      toolArguments: {
        cartId: extractCartId(request),
        idempotencyKey: `thread-${extractCartId(request)}`,
      },
    });
  }
  if (names.includes("checkout")) {
    return completion({
      model: request.model,
      content: "订单已提交，还没有付款。请选择微信支付或支付宝。",
    });
  }
  return completion({
    model: request.model,
    content: "请确认订单卡片后，我再帮你提交。",
  });
}

function extractSkuId(request: ChatCompletionRequest): string | undefined {
  for (const message of [...request.messages].reverse()) {
    const content = typeof message.content === "string" ? message.content : "";
    const keyed = extractUuid(content, "skuId");
    if (keyed) {
      return keyed;
    }
  }
  return undefined;
}

function extractCartId(request: ChatCompletionRequest): string {
  for (const message of [...request.messages].reverse()) {
    if (!message.content) {
      continue;
    }
    const keyed = extractUuid(message.content, "cartId");
    if (keyed) {
      return keyed;
    }
    const match = message.content.match(/"cartId"\s*:\s*"([0-9a-f-]{36})"/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "00000000-0000-4000-8000-000000000001";
}

function extractOrderId(request: ChatCompletionRequest): string {
  for (const message of [...request.messages].reverse()) {
    if (message.role !== "tool" || !message.content) {
      continue;
    }
    const match = message.content.match(/"orderId"\s*:\s*"([0-9a-f-]{36})"/i);
    if (match?.[1]) {
      return match[1];
    }
  }
  return "00000000-0000-4000-8000-000000000002";
}

export function completeChat(input: unknown): ChatCompletionResponse {
  const request = ChatCompletionRequestSchema.parse(input);
  if (isClassify(request)) {
    const classification = IntentClassificationSchema.parse(classify(lastUserText(request)));
    return completion({
      model: request.model,
      content: JSON.stringify(classification),
    });
  }
  return nextOrderingTool(request);
}

export function streamChat(input: unknown): ChatCompletionChunk[] {
  const response = completeChat(input);
  const choice = response.choices[0];
  if (!choice) {
    return [];
  }
  const chunks: ChatCompletionChunk[] = [
    {
      id: response.id,
      object: "chat.completion.chunk",
      created: response.created,
      model: response.model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    },
  ];
  if (choice.message.tool_calls?.[0]) {
    const call = choice.message.tool_calls[0];
    chunks.push({
      id: response.id,
      object: "chat.completion.chunk",
      created: response.created,
      model: response.model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: call.id,
                type: "function",
                function: { name: call.function.name, arguments: "" },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    });
    chunks.push({
      id: response.id,
      object: "chat.completion.chunk",
      created: response.created,
      model: response.model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: call.function.arguments },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    });
    chunks.push({
      id: response.id,
      object: "chat.completion.chunk",
      created: response.created,
      model: response.model,
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    });
    return chunks;
  }
  const text = choice.message.content ?? "";
  for (const part of chunkText(text)) {
    chunks.push({
      id: response.id,
      object: "chat.completion.chunk",
      created: response.created,
      model: response.model,
      choices: [{ index: 0, delta: { content: part }, finish_reason: null }],
    });
  }
  chunks.push({
    id: response.id,
    object: "chat.completion.chunk",
    created: response.created,
    model: response.model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  });
  return chunks;
}

export { chunkText };
