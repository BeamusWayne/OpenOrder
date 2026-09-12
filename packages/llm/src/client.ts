import {
  ChatCompletionChunkSchema,
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  type ChatCompletionChunk,
  type ChatCompletionRequest,
  type ChatCompletionResponse,
} from "@openorder/protocol";

export type LlmConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
};

export class LlmClient {
  constructor(private readonly config: LlmConfig) {}

  async complete(request: Omit<ChatCompletionRequest, "model" | "stream">): Promise<ChatCompletionResponse> {
    const body = ChatCompletionRequestSchema.parse({
      ...request,
      model: this.config.model,
      stream: false,
    });
    const response = await fetch(`${this.config.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`LLM ${response.status}: ${await response.text()}`);
    }
    return ChatCompletionResponseSchema.parse(await response.json());
  }

  async *stream(
    request: Omit<ChatCompletionRequest, "model" | "stream">,
  ): AsyncGenerator<ChatCompletionChunk> {
    const body = ChatCompletionRequestSchema.parse({
      ...request,
      model: this.config.model,
      stream: true,
    });
    const response = await fetch(`${this.config.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      throw new Error(`LLM stream ${response.status}: ${await response.text()}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          return;
        }
        yield ChatCompletionChunkSchema.parse(JSON.parse(data));
      }
    }
  }
}
