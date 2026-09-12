import { describe, expect, it } from "vitest";
import { ChatCompletionRequestSchema, ChatCompletionResponseSchema } from "./openai.js";

describe("OpenAI protocol contracts", () => {
  it("accepts a tool-calling chat completion request", () => {
    const parsed = ChatCompletionRequestSchema.parse({
      model: "openorder-mock",
      stream: false,
      messages: [{ role: "user", content: "帮我点杯瑞幸" }],
      tools: [{ type: "function", function: { name: "search_stores" } }],
    });
    expect(parsed.messages[0]?.role).toBe("user");
  });

  it("accepts a tool_calls completion response", () => {
    const parsed = ChatCompletionResponseSchema.parse({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "openorder-mock",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "search_stores", arguments: "{\"query\":\"瑞幸\"}" },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
    });
    expect(parsed.choices[0]?.message.tool_calls?.[0]?.function.name).toBe("search_stores");
  });
});
