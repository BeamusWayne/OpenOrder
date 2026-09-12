import { z } from "zod";
import { UiBlockSchema } from "./ui.js";

export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({ type: z.literal("intent"), intent: z.string(), reason: z.string() }),
  z.object({
    type: z.literal("tool_start"),
    name: z.string(),
    arguments: z.unknown(),
  }),
  z.object({
    type: z.literal("tool_end"),
    name: z.string(),
    result: z.unknown(),
  }),
  z.object({ type: z.literal("ui"), block: UiBlockSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("done"), threadId: z.string().uuid() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
