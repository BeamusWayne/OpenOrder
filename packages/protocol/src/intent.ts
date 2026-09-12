import { z } from "zod";

export const IntentSchema = z.enum(["ordering", "order_followup", "out_of_scope"]);
export type Intent = z.infer<typeof IntentSchema>;

export const IntentClassificationSchema = z.object({
  intent: IntentSchema,
  reason: z.string().min(1),
});
export type IntentClassification = z.infer<typeof IntentClassificationSchema>;
