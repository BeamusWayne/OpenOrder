import { describe, expect, it } from "vitest";
import { ChatCompletionChunkSchema, IntentClassificationSchema } from "@openorder/protocol";
import { completeChat, streamChat } from "./engine.js";

describe("OpenAI-compatible mock", () => {
  it("classifies a Transformer question as out_of_scope", () => {
    const response = completeChat({
      model: "openorder-mock",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "classify OpenOrder intent as JSON" },
        { role: "user", content: "解释一下Transformer框架的原理" },
      ],
    });
    const parsed = IntentClassificationSchema.parse(JSON.parse(response.choices[0]?.message.content ?? "{}"));
    expect(parsed.intent).toBe("out_of_scope");
    expect(response.object).toBe("chat.completion");
  });

  it("uses storeId from a follow-up store pick", () => {
    const response = completeChat({
      model: "openorder-mock",
      messages: [
        { role: "user", content: "帮我点杯瑞幸生椰拿铁少糖" },
        { role: "tool", name: "search_stores", content: "[]" },
        { role: "user", content: "就这家：瑞幸咖啡 新天地店 storeId=22222222-2222-4222-8222-222222222202" },
      ],
    });
    expect(response.choices[0]?.message.tool_calls?.[0]?.function.name).toBe("get_menu");
    expect(response.choices[0]?.message.tool_calls?.[0]?.function.arguments).toContain(
      "22222222-2222-4222-8222-222222222202",
    );
  });

  it("emits search_stores tool_calls for a Luckin order", () => {
    const response = completeChat({
      model: "openorder-mock",
      messages: [{ role: "user", content: "帮我点杯瑞幸生椰拿铁少糖" }],
      tools: [{ type: "function", function: { name: "search_stores" } }],
    });
    expect(response.choices[0]?.finish_reason).toBe("tool_calls");
    expect(response.choices[0]?.message.tool_calls?.[0]?.function.name).toBe("search_stores");
    expect(response.choices[0]?.message.tool_calls?.[0]?.type).toBe("function");
  });

  it("does not auto-call pay_order after checkout", () => {
    const response = completeChat({
      model: "openorder-mock",
      messages: [
        { role: "user", content: "确认下单 cartId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1" },
        { role: "tool", name: "search_stores", content: "[]" },
        { role: "tool", name: "get_menu", content: "{}" },
        { role: "tool", name: "add_cart_item", content: "{}" },
        { role: "tool", name: "prepare_checkout", content: "{}" },
        {
          role: "tool",
          name: "checkout",
          content: '{"orderId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}',
        },
      ],
    });
    expect(response.choices[0]?.message.tool_calls).toBeUndefined();
    expect(response.choices[0]?.message.content).toContain("还没有付款");
    expect(response.choices[0]?.message.content).not.toContain("已经为你完成模拟支付");
  });

  it("streams assistant text as multiple content chunks", () => {
    const chunks = streamChat({
      model: "openorder-mock",
      stream: true,
      messages: [
        { role: "user", content: "帮我点杯瑞幸" },
        { role: "tool", name: "search_stores", content: "[]" },
        { role: "tool", name: "get_menu", content: "{}" },
        { role: "tool", name: "add_cart_item", content: "{}" },
        { role: "tool", name: "prepare_checkout", content: "{}" },
      ],
    });
    const contents = chunks
      .map((chunk) => chunk.choices[0]?.delta.content)
      .filter((part): part is string => Boolean(part));
    expect(contents.length).toBeGreaterThan(1);
    expect(contents.join("")).toContain("请确认订单卡片");
  });

  it("streams tool_calls using the official chunk shape", () => {
    const chunks = streamChat({
      model: "openorder-mock",
      stream: true,
      messages: [{ role: "user", content: "帮我点杯瑞幸" }],
    });
    for (const chunk of chunks) {
      expect(ChatCompletionChunkSchema.parse(chunk).object).toBe("chat.completion.chunk");
    }
    expect(chunks.at(-1)?.choices[0]?.finish_reason).toBe("tool_calls");
  });
});
