import { z } from "zod";

const MoneyCents = z.number().int();

export const ConfirmLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: MoneyCents,
  modifiers: z.array(z.string()),
});

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
  skus: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        size: z.string().optional(),
        basePriceCents: MoneyCents.optional(),
        quantity: z.number().int().optional(),
      }),
    )
    .optional()
    .default([]),
  groups: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      required: z.boolean(),
      options: z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          priceDeltaCents: MoneyCents,
        }),
      ),
    }),
  ),
});

export const OrderConfirmSchema = z.object({
  type: z.literal("order_confirm"),
  cartId: z.string().uuid(),
  storeName: z.string(),
  lines: z.array(ConfirmLineSchema),
  totalCents: MoneyCents.nonnegative(),
});

export const PaymentBlockSchema = z.object({
  type: z.literal("payment"),
  orderId: z.string().uuid(),
  amountCents: MoneyCents.nonnegative(),
  provider: z.literal("mock"),
});

export const PaymentSheetSchema = z.object({
  type: z.literal("payment_sheet"),
  orderId: z.string().uuid(),
  amountCents: MoneyCents.nonnegative(),
  storeName: z.string(),
  merchantName: z.string(),
  lines: z.array(ConfirmLineSchema).optional().default([]),
});

export const WechatPaySchema = z.object({
  type: z.literal("wechat_pay"),
  orderId: z.string().uuid(),
  amountCents: MoneyCents.nonnegative(),
  merchantName: z.string(),
});

export const AlipaySchema = z.object({
  type: z.literal("alipay"),
  orderId: z.string().uuid(),
  amountCents: MoneyCents.nonnegative(),
  merchantName: z.string(),
});

export const PayReceiptSchema = z.object({
  type: z.literal("pay_receipt"),
  orderId: z.string().uuid(),
  amountCents: MoneyCents.nonnegative(),
  provider: z.enum(["wechat", "alipay", "mock"]),
  storeName: z.string(),
  merchantName: z.string(),
  paidAt: z.string(),
});

export const ProgressStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  state: z.enum(["done", "current", "pending"]),
});

export const OrderProgressSchema = z.object({
  type: z.literal("order_progress"),
  orderId: z.string().uuid(),
  storeName: z.string(),
  status: z.string(),
  steps: z.array(ProgressStepSchema),
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
  PaymentSheetSchema,
  WechatPaySchema,
  AlipaySchema,
  PayReceiptSchema,
  OrderProgressSchema,
  OrderStatusBlockSchema,
  InterceptBlockSchema,
]);
export type UiBlock = z.infer<typeof UiBlockSchema>;

const FULFILLMENT_KEYS = ["paid", "accepted", "making", "ready"] as const;
const FULFILLMENT_LABEL: Record<(typeof FULFILLMENT_KEYS)[number], string> = {
  paid: "支付成功",
  accepted: "商家接单",
  making: "制作中",
  ready: "可取餐",
};

export function progressSteps(status: string) {
  const current = FULFILLMENT_KEYS.indexOf(status as (typeof FULFILLMENT_KEYS)[number]);
  return FULFILLMENT_KEYS.map((key, index) => ({
    key,
    label: FULFILLMENT_LABEL[key],
    state: current < 0 ? ("pending" as const) : index < current ? ("done" as const) : index === current ? ("current" as const) : ("pending" as const),
  }));
}
