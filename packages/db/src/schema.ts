import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const customerKind = pgEnum("customer_kind", ["guest", "registered"]);
export const cartStatus = pgEnum("cart_status", ["open", "checked_out"]);
export const orderStatus = pgEnum("order_status", [
  "draft_confirmed",
  "paid",
  "accepted",
  "making",
  "ready",
  "completed",
  "cancelled",
]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed"]);
export const fulfillmentKind = pgEnum("fulfillment_kind", ["pickup", "delivery"]);
export const threadStatus = pgEnum("thread_status", ["active", "paused", "closed"]);
export const messageRole = pgEnum("message_role", ["system", "user", "assistant", "tool"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  kind: customerKind("kind").notNull().default("guest"),
  ...timestamps,
});

export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    name: text("name").notNull(),
    city: text("city").notNull(),
    address: text("address").notNull(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
    longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
    rating: numeric("rating", { precision: 2, scale: 1 }).notNull(),
    openHour: integer("open_hour").notNull(),
    closeHour: integer("close_hour").notNull(),
    supportsPickup: boolean("supports_pickup").notNull().default(true),
    supportsDelivery: boolean("supports_delivery").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("stores_brand_idx").on(table.brandId)],
);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const items = pgTable("items", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
});

export const skus = pgTable("skus", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id),
  name: text("name").notNull(),
  size: text("size").notNull(),
  basePriceCents: integer("base_price_cents").notNull(),
});

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(true),
  minSelect: integer("min_select").notNull().default(1),
  maxSelect: integer("max_select").notNull().default(1),
});

export const modifiers = pgTable("modifiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => modifierGroups.id),
  name: text("name").notNull(),
  priceDeltaCents: integer("price_delta_cents").notNull().default(0),
});

export const inventory = pgTable("inventory", {
  skuId: uuid("sku_id")
    .primaryKey()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    threadId: uuid("thread_id"),
    status: cartStatus("status").notNull().default("open"),
    ...timestamps,
  },
  (table) => [index("carts_customer_open_idx").on(table.customerId, table.status)],
);

export const cartLines = pgTable("cart_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  quantity: integer("quantity").notNull(),
  modifierIds: jsonb("modifier_ids").$type<string[]>().notNull().default([]),
  unitPriceCents: integer("unit_price_cents").notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id),
    status: orderStatus("status").notNull().default("draft_confirmed"),
    fulfillment: fulfillmentKind("fulfillment").notNull().default("pickup"),
    totalCents: integer("total_cents").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("orders_idempotency_unique").on(table.customerId, table.idempotencyKey),
    index("orders_customer_idx").on(table.customerId),
  ],
);

export const orderLines = pgTable("order_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  skuId: uuid("sku_id")
    .notNull()
    .references(() => skus.id),
  nameSnapshot: text("name_snapshot").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  modifiersSnapshot: jsonb("modifiers_snapshot").$type<string[]>().notNull(),
});

export const orderEvents = pgTable("order_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  status: paymentStatus("status").notNull().default("pending"),
  amountCents: integer("amount_cents").notNull(),
  provider: text("provider").notNull().default("mock"),
  ...timestamps,
});

export const threads = pgTable("threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  status: threadStatus("status").notNull().default("active"),
  interrupt: jsonb("interrupt").$type<Record<string, unknown> | null>(),
  ...timestamps,
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id),
    role: messageRole("role").notNull(),
    content: text("content"),
    toolCallId: text("tool_call_id"),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_thread_idx").on(table.threadId, table.createdAt)],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  route: text("route").notNull(),
  response: jsonb("response").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const metricCounters = pgTable("metric_counters", {
  name: text("name").primaryKey(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
});
