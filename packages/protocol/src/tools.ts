import { z } from "zod";

export const SearchStoresInputSchema = z.object({
  query: z.string().min(1),
  brand: z.string().optional(),
  item: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const GetMenuInputSchema = z.object({
  storeId: z.string().uuid(),
  itemQuery: z.string().optional(),
});

export const AddCartItemInputSchema = z.object({
  storeId: z.string().uuid(),
  skuId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  modifierIds: z.array(z.string().uuid()).default([]),
});

export const GetCartInputSchema = z.object({
  cartId: z.string().uuid().optional(),
});

export const PrepareCheckoutInputSchema = z.object({
  cartId: z.string().uuid(),
});

export const CheckoutInputSchema = z.object({
  cartId: z.string().uuid(),
  idempotencyKey: z.string().min(8),
});

export const PayOrderInputSchema = z.object({
  orderId: z.string().uuid(),
});

export const GetOrderInputSchema = z.object({
  orderId: z.string().uuid(),
});

export const TOOL_NAMES = [
  "search_stores",
  "get_menu",
  "add_cart_item",
  "get_cart",
  "prepare_checkout",
  "checkout",
  "pay_order",
  "get_order",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const OPENAI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_stores",
      description: "Find nearby beverage stores matching a brand or drink.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          brand: { type: "string" },
          item: { type: "string" },
          latitude: { type: "number" },
          longitude: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_menu",
      description: "Read a store menu, optionally filtered by drink name.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          storeId: { type: "string" },
          itemQuery: { type: "string" },
        },
        required: ["storeId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_cart_item",
      description: "Add a configured SKU to the current cart.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          storeId: { type: "string" },
          skuId: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          modifierIds: { type: "array", items: { type: "string" } },
        },
        required: ["storeId", "skuId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_cart",
      description: "Show the current open cart.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          cartId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "prepare_checkout",
      description: "Build an order confirmation card. Does not charge the customer.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          cartId: { type: "string" },
        },
        required: ["cartId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "checkout",
      description: "Submit the cart as an order. Requires a prior customer confirmation.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          cartId: { type: "string" },
          idempotencyKey: { type: "string" },
        },
        required: ["cartId", "idempotencyKey"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "pay_order",
      description: "Capture mock payment for a submitted order.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          orderId: { type: "string" },
        },
        required: ["orderId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order",
      description: "Look up an order and its fulfillment status.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          orderId: { type: "string" },
        },
        required: ["orderId"],
      },
    },
  },
];
