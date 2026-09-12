import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
  brands,
  cartLines,
  carts,
  categories,
  customers,
  inventory,
  items,
  modifierGroups,
  modifiers,
  orderEvents,
  orderLines,
  orders,
  payments,
  skus,
  stores,
  type Database,
} from "@openorder/db";
import { DomainError, NotFoundError, SoldOutError } from "./errors.js";
import { haversineMeters } from "./geo.js";

const DEFAULT_LAT = 31.2304;
const DEFAULT_LNG = 121.4737;

export class Ordering {
  constructor(private readonly db: Database) {}

  async createGuest(displayName = "访客") {
    const [customer] = await this.db
      .insert(customers)
      .values({ displayName, kind: "guest" })
      .returning();
    if (!customer) {
      throw new DomainError("create_failed", "Could not create customer", 500);
    }
    return customer;
  }

  async searchStores(input: {
    query: string;
    brand?: string;
    item?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const lat = input.latitude ?? DEFAULT_LAT;
    const lng = input.longitude ?? DEFAULT_LNG;
    const needle = `%${input.item ?? input.query}%`;
    const brandNeedle = `%${input.brand ?? input.query}%`;

    const rows = await this.db
      .select({
        store: stores,
        brandName: brands.name,
        itemName: items.name,
      })
      .from(stores)
      .innerJoin(brands, eq(stores.brandId, brands.id))
      .leftJoin(categories, eq(categories.storeId, stores.id))
      .leftJoin(items, eq(items.categoryId, categories.id))
      .where(
        or(
          ilike(brands.name, brandNeedle),
          ilike(stores.name, `%${input.query}%`),
          ilike(items.name, needle),
        ),
      );

    const unique = new Map<
      string,
      { store: typeof stores.$inferSelect; brandName: string }
    >();
    for (const row of rows) {
      unique.set(row.store.id, { store: row.store, brandName: row.brandName });
    }

    return [...unique.values()]
      .map(({ store, brandName }) => {
        const distanceMeters = Math.round(
          haversineMeters(lat, lng, Number(store.latitude), Number(store.longitude)),
        );
        return {
          id: store.id,
          brand: brandName,
          name: store.name,
          distanceMeters,
          rating: Number(store.rating),
          etaMinutes: Math.max(15, Math.round(distanceMeters / 80)),
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 8);
  }

  async getMenu(storeId: string, itemQuery?: string) {
    const store = await this.db.query.stores.findFirst({
      where: eq(stores.id, storeId),
    });
    if (!store) {
      throw new NotFoundError("Store");
    }

    const categoryRows = await this.db
      .select()
      .from(categories)
      .where(eq(categories.storeId, storeId));
    const categoryIds = categoryRows.map((row) => row.id);
    if (categoryIds.length === 0) {
      return { storeId, items: [] };
    }

    const itemRows = await this.db
      .select()
      .from(items)
      .where(
        and(
          inArray(items.categoryId, categoryIds),
          itemQuery ? ilike(items.name, `%${itemQuery}%`) : undefined,
        ),
      );

    const result = [];
    for (const item of itemRows) {
      const skuRows = await this.db.select().from(skus).where(eq(skus.itemId, item.id));
      const groups = await this.db
        .select()
        .from(modifierGroups)
        .where(eq(modifierGroups.itemId, item.id));
      const groupPayload = [];
      for (const group of groups) {
        const options = await this.db
          .select()
          .from(modifiers)
          .where(eq(modifiers.groupId, group.id));
        groupPayload.push({
          id: group.id,
          name: group.name,
          required: group.required,
          options: options.map((option) => ({
            id: option.id,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          })),
        });
      }
      const skuPayload = [];
      for (const sku of skuRows) {
        const stock = await this.db.query.inventory.findFirst({
          where: eq(inventory.skuId, sku.id),
        });
        skuPayload.push({
          id: sku.id,
          name: sku.name,
          size: sku.size,
          basePriceCents: sku.basePriceCents,
          quantity: stock?.quantity ?? 0,
        });
      }
      result.push({
        id: item.id,
        name: item.name,
        description: item.description,
        skus: skuPayload,
        groups: groupPayload,
      });
    }
    return { storeId, storeName: store.name, items: result };
  }

  async addCartItem(input: {
    customerId: string;
    storeId: string;
    skuId: string;
    quantity: number;
    modifierIds: string[];
    threadId?: string;
  }) {
    const sku = await this.db.query.skus.findFirst({ where: eq(skus.id, input.skuId) });
    if (!sku) {
      throw new NotFoundError("SKU");
    }
    const stock = await this.db.query.inventory.findFirst({
      where: eq(inventory.skuId, input.skuId),
    });
    if (!stock || stock.quantity < input.quantity) {
      throw new SoldOutError(sku.name);
    }

    const selected = input.modifierIds.length
      ? await this.db.select().from(modifiers).where(inArray(modifiers.id, input.modifierIds))
      : [];
    const unitPriceCents =
      sku.basePriceCents + selected.reduce((sum, modifier) => sum + modifier.priceDeltaCents, 0);

    const existing = await this.db.query.carts.findFirst({
      where: and(
        eq(carts.customerId, input.customerId),
        eq(carts.storeId, input.storeId),
        eq(carts.status, "open"),
      ),
    });

    const cart =
      existing ??
      (
        await this.db
          .insert(carts)
          .values({
            customerId: input.customerId,
            storeId: input.storeId,
            threadId: input.threadId,
            status: "open",
          })
          .returning()
      )[0];
    if (!cart) {
      throw new DomainError("create_failed", "Could not create cart", 500);
    }

    await this.db.insert(cartLines).values({
      cartId: cart.id,
      skuId: input.skuId,
      quantity: input.quantity,
      modifierIds: input.modifierIds,
      unitPriceCents,
    });
    return this.getCart(cart.id, input.customerId);
  }

  async getCart(cartId: string, customerId: string) {
    const cart = await this.db.query.carts.findFirst({
      where: and(eq(carts.id, cartId), eq(carts.customerId, customerId)),
    });
    if (!cart) {
      throw new NotFoundError("Cart");
    }
    const store = await this.db.query.stores.findFirst({ where: eq(stores.id, cart.storeId) });
    const lines = await this.db.select().from(cartLines).where(eq(cartLines.cartId, cart.id));
    const detailed = [];
    for (const line of lines) {
      const sku = await this.db.query.skus.findFirst({ where: eq(skus.id, line.skuId) });
      const selected = line.modifierIds.length
        ? await this.db.select().from(modifiers).where(inArray(modifiers.id, line.modifierIds))
        : [];
      detailed.push({
        id: line.id,
        name: sku?.name ?? "unknown",
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        modifiers: selected.map((modifier) => modifier.name),
      });
    }
    const totalCents = detailed.reduce(
      (sum, line) => sum + line.unitPriceCents * line.quantity,
      0,
    );
    return {
      cartId: cart.id,
      storeId: cart.storeId,
      storeName: store?.name ?? "",
      status: cart.status,
      lines: detailed,
      totalCents,
    };
  }

  async latestOpenCart(customerId: string) {
    const cart = await this.db.query.carts.findFirst({
      where: and(eq(carts.customerId, customerId), eq(carts.status, "open")),
      orderBy: desc(carts.updatedAt),
    });
    return cart ? this.getCart(cart.id, customerId) : null;
  }

  async configureCart(input: {
    customerId: string;
    cartId: string;
    skuId: string;
    modifierIds: string[];
    quantity?: number;
  }) {
    const cart = await this.db.query.carts.findFirst({
      where: and(
        eq(carts.id, input.cartId),
        eq(carts.customerId, input.customerId),
        eq(carts.status, "open"),
      ),
    });
    if (!cart) {
      throw new NotFoundError("Cart");
    }
    const sku = await this.db.query.skus.findFirst({ where: eq(skus.id, input.skuId) });
    if (!sku) {
      throw new NotFoundError("SKU");
    }
    const quantity = input.quantity ?? 1;
    const stock = await this.db.query.inventory.findFirst({
      where: eq(inventory.skuId, input.skuId),
    });
    if (!stock || stock.quantity < quantity) {
      throw new SoldOutError(sku.name);
    }
    const selected = input.modifierIds.length
      ? await this.db.select().from(modifiers).where(inArray(modifiers.id, input.modifierIds))
      : [];
    const unitPriceCents =
      sku.basePriceCents + selected.reduce((sum, modifier) => sum + modifier.priceDeltaCents, 0);
    const lines = await this.db.select().from(cartLines).where(eq(cartLines.cartId, cart.id));
    const last = lines.at(-1);
    if (!last) {
      throw new DomainError("empty_cart", "Cart is empty");
    }
    await this.db
      .update(cartLines)
      .set({
        skuId: input.skuId,
        quantity,
        modifierIds: input.modifierIds,
        unitPriceCents,
      })
      .where(eq(cartLines.id, last.id));
    return this.getCart(cart.id, input.customerId);
  }

  async prepareCheckout(cartId: string, customerId: string) {
    const cart = await this.getCart(cartId, customerId);
    if (cart.lines.length === 0) {
      throw new DomainError("empty_cart", "Cart is empty");
    }
    return {
      type: "order_confirm" as const,
      cartId: cart.cartId,
      storeName: cart.storeName,
      lines: cart.lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        modifiers: line.modifiers,
      })),
      totalCents: cart.totalCents,
    };
  }

  async checkout(input: {
    customerId: string;
    cartId: string;
    idempotencyKey: string;
    confirmed: boolean;
  }) {
    if (!input.confirmed) {
      throw new DomainError("confirmation_required", "Checkout requires a prior confirmation", 409);
    }

    return this.db.transaction(async (tx) => {
      const replay = await tx.query.orders.findFirst({
        where: and(
          eq(orders.customerId, input.customerId),
          eq(orders.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (replay) {
        return this.serializeOrder(replay.id, tx);
      }

      const cart = await tx.query.carts.findFirst({
        where: and(
          eq(carts.id, input.cartId),
          eq(carts.customerId, input.customerId),
          eq(carts.status, "open"),
        ),
      });
      if (!cart) {
        throw new NotFoundError("Cart");
      }

      const lines = await tx.select().from(cartLines).where(eq(cartLines.cartId, cart.id));
      if (lines.length === 0) {
        throw new DomainError("empty_cart", "Cart is empty");
      }

      let totalCents = 0;
      const snapshots: Array<{
        skuId: string;
        name: string;
        quantity: number;
        unitPriceCents: number;
        modifiers: string[];
      }> = [];

      for (const line of lines) {
        const [stock] = await tx
          .select()
          .from(inventory)
          .where(eq(inventory.skuId, line.skuId))
          .for("update");
        const sku = await tx.query.skus.findFirst({ where: eq(skus.id, line.skuId) });
        if (!stock || !sku || stock.quantity < line.quantity) {
          throw new SoldOutError(sku?.name ?? line.skuId);
        }
        await tx
          .update(inventory)
          .set({ quantity: stock.quantity - line.quantity, updatedAt: new Date() })
          .where(eq(inventory.skuId, line.skuId));

        const selected = line.modifierIds.length
          ? await tx.select().from(modifiers).where(inArray(modifiers.id, line.modifierIds))
          : [];
        totalCents += line.unitPriceCents * line.quantity;
        snapshots.push({
          skuId: line.skuId,
          name: sku.name,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          modifiers: selected.map((modifier) => modifier.name),
        });
      }

      const [order] = await tx
        .insert(orders)
        .values({
          customerId: input.customerId,
          storeId: cart.storeId,
          cartId: cart.id,
          status: "draft_confirmed",
          totalCents,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      if (!order) {
        throw new DomainError("create_failed", "Could not create order", 500);
      }

      for (const snapshot of snapshots) {
        await tx.insert(orderLines).values({
          orderId: order.id,
          skuId: snapshot.skuId,
          nameSnapshot: snapshot.name,
          quantity: snapshot.quantity,
          unitPriceCents: snapshot.unitPriceCents,
          modifiersSnapshot: snapshot.modifiers,
        });
      }

      await tx.insert(payments).values({
        orderId: order.id,
        amountCents: totalCents,
        status: "pending",
        provider: "mock",
      });
      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: "placed",
        payload: { totalCents },
      });
      await tx.update(carts).set({ status: "checked_out", updatedAt: new Date() }).where(eq(carts.id, cart.id));
      return this.serializeOrder(order.id, tx);
    });
  }

  async pay(orderId: string, customerId: string, provider = "mock") {
    return this.db.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.customerId, customerId)),
      });
      if (!order) {
        throw new NotFoundError("Order");
      }
      if (order.status !== "draft_confirmed") {
        return this.serializeOrder(order.id, tx);
      }
      await tx
        .update(payments)
        .set({ status: "succeeded", provider, updatedAt: new Date() })
        .where(eq(payments.orderId, order.id));
      await tx
        .update(orders)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: "paid",
        payload: { provider },
      });
      return this.serializeOrder(order.id, tx);
    });
  }

  async advanceFulfillment(orderId: string, customerId: string) {
    return this.db.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.customerId, customerId)),
      });
      if (!order) {
        throw new NotFoundError("Order");
      }
      const next =
        order.status === "paid"
          ? "accepted"
          : order.status === "accepted"
            ? "making"
            : order.status === "making"
              ? "ready"
              : null;
      if (!next) {
        return this.serializeOrder(order.id, tx);
      }
      await tx
        .update(orders)
        .set({ status: next, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: next,
        payload: {},
      });
      return this.serializeOrder(order.id, tx);
    });
  }

  async getOrder(orderId: string, customerId: string) {
    const order = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, orderId), eq(orders.customerId, customerId)),
    });
    if (!order) {
      throw new NotFoundError("Order");
    }
    return this.serializeOrder(order.id, this.db);
  }

  async listOrders(customerId: string) {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt));
    const result = [];
    for (const row of rows) {
      result.push(await this.serializeOrder(row.id, this.db));
    }
    return result;
  }

  private async serializeOrder(
    orderId: string,
    dbx: Pick<Database, "query" | "select">,
  ) {
    const order = await dbx.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!order) {
      throw new NotFoundError("Order");
    }
    const store = await dbx.query.stores.findFirst({ where: eq(stores.id, order.storeId) });
    const brand = store
      ? await dbx.query.brands.findFirst({ where: eq(brands.id, store.brandId) })
      : undefined;
    const lines = await dbx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    const payment = await dbx.query.payments.findFirst({
      where: eq(payments.orderId, order.id),
    });
    const events = await dbx
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id));
    return {
      orderId: order.id,
      status: order.status,
      storeName: store?.name ?? "",
      merchantName: brand?.name ?? store?.name.split(/\s+/)[0] ?? "商家",
      totalCents: order.totalCents,
      paymentStatus: payment?.status ?? "pending",
      paymentProvider: payment?.provider ?? "mock",
      lines: lines.map((line) => ({
        name: line.nameSnapshot,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        modifiers: line.modifiersSnapshot,
      })),
      events: events.map((event) => ({ type: event.type, createdAt: event.createdAt })),
    };
  }
}
