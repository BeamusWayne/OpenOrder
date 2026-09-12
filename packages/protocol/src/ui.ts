import { z } from "zod";

export const StoreCardSchema = z.object({
  type: z.literal("store_list"),
  stores: z.array(
    z.object({
      id: z.string().uuid(),
      brand: z.string(),
      name: z.string(),
      distanceMeters: z.number().nonnegative(),
      rating: z.number(),
      etaMinutes: z.number().int(),
    }),
  ),
});

export const ModifierPickerSchema = z.object({
  type: z.literal("modifier_picker"),
  storeId: z.string().uuid(),
  itemId: z.string().uuid(),
  itemName: z.string(),
  skuId: z.string().uuid(),
  groups: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      required: z.boolean(),
      options: z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          priceDeltaCents: z.number().int(),
        }),
      ),
    }),
  ),
});

export const OrderConfirmSchema = z.object({
  type: z.literal("order_confirm"),
  cartId: z.string().uuid(),
  storeName: z.string(),
  lines: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int(),
      modifiers: z.array(z.string()),
    }),
  ),
  totalCents: z.number().int().nonnegative(),
});

export const PaymentBlockSchema = z.object({
  type: z.literal("payment"),
  orderId: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
  provider: z.literal("mock"),
});

export const OrderStatusBlockSchema = z.object({
  type: z.literal("order_status"),
  orderId: z.string().uuid(),
  status: z.string(),
  storeName: z.string(),
});

export const InterceptBlockSchema = z.object({
  type: z.literal("intercept"),
  message: z.string(),
});

export const UiBlockSchema = z.discriminatedUnion("type", [
  StoreCardSchema,
  ModifierPickerSchema,
  OrderConfirmSchema,
  PaymentBlockSchema,
  OrderStatusBlockSchema,
  InterceptBlockSchema,
]);
export type UiBlock = z.infer<typeof UiBlockSchema>;
