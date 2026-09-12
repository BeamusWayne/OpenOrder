import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ChatCompletionRequestSchema } from "@openorder/protocol";
import { completeChat, streamChat } from "./engine.js";

export const mockApp = new Hono();

mockApp.get("/health", (context) => context.json({ ok: true, service: "llm-mock" }));

mockApp.post("/v1/chat/completions", async (context) => {
  const body = ChatCompletionRequestSchema.parse(await context.req.json());
  if (!body.stream) {
    return context.json(completeChat(body));
  }
  const chunks = streamChat(body);
  return streamSSE(context, async (stream) => {
    for (const chunk of chunks) {
      await stream.writeSSE({ data: JSON.stringify(chunk) });
    }
    await stream.writeSSE({ data: "[DONE]" });
  });
});
