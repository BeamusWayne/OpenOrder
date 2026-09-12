import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      }),
    )
    .optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatCompletionRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z
    .union([z.literal("auto"), z.literal("none"), z.literal("required"), z.record(z.unknown())])
    .optional(),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  response_format: z
    .object({
      type: z.enum(["text", "json_object"]),
    })
    .optional(),
});
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number().int(),
      message: ChatMessageSchema.extend({ role: z.literal("assistant") }),
      finish_reason: z.enum(["stop", "tool_calls", "length"]),
    }),
  ),
  usage: z.object({
    prompt_tokens: z.number().int(),
    completion_tokens: z.number().int(),
    total_tokens: z.number().int(),
  }),
});
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(
    z.object({
      index: z.number().int(),
      delta: z.object({
        role: z.literal("assistant").optional(),
        content: z.string().optional(),
        tool_calls: z
          .array(
            z.object({
              index: z.number().int(),
              id: z.string().optional(),
              type: z.literal("function").optional(),
              function: z
                .object({
                  name: z.string().optional(),
                  arguments: z.string().optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
      finish_reason: z.enum(["stop", "tool_calls", "length"]).nullable(),
    }),
  ),
});
export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;
