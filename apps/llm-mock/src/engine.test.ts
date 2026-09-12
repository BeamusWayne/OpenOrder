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
