import { eq } from "drizzle-orm";
import { createDb, inventory } from "@openorder/db";
import { IDS, seedCatalog } from "@openorder/simulator";
import { beforeAll, describe, expect, it } from "vitest";
import { Ordering } from "./ordering.js";
import { SoldOutError } from "./errors.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://openorder:openorder@127.0.0.1:5433/openorder";

describe("Ordering", () => {
  const db = createDb(databaseUrl);
  const ordering = new Ordering(db);

  beforeAll(async () => {
    await seedCatalog(db);
  });

  it("replays checkout for the same idempotency key", async () => {
    const customer = await ordering.createGuest("idem");
    const cart = await ordering.addCartItem({
      customerId: customer.id,
      storeId: IDS.stores.luckinNanjing,
      skuId: IDS.skus.coconutLatteMedium,
      quantity: 1,
      modifierIds: [IDS.modifiers.sugarLess, IDS.modifiers.iceNone],
    });
    const first = await ordering.checkout({
      customerId: customer.id,
      cartId: cart.cartId,
      idempotencyKey: "idem-checkout-1",
      confirmed: true,
    });
    const second = await ordering.checkout({
      customerId: customer.id,
      cartId: cart.cartId,
      idempotencyKey: "idem-checkout-1",
      confirmed: true,
    });
    expect(second.orderId).toBe(first.orderId);
    expect(first.lines[0]?.modifiers).toContain("少糖");
  });

  it("pays without jumping to fulfillment and then advances step by step", async () => {
    const customer = await ordering.createGuest("pay-flow");
    const cart = await ordering.addCartItem({
      customerId: customer.id,
      storeId: IDS.stores.luckinNanjing,
      skuId: IDS.skus.coconutLatteMedium,
      quantity: 1,
      modifierIds: [IDS.modifiers.sugarLess, IDS.modifiers.iceNone],
    });
    const placed = await ordering.checkout({
      customerId: customer.id,
      cartId: cart.cartId,
      idempotencyKey: "idem-pay-flow-1",
      confirmed: true,
    });
    expect(placed.status).toBe("draft_confirmed");
    expect(placed.paymentStatus).toBe("pending");

    const paid = await ordering.pay(placed.orderId, customer.id, "alipay");
    expect(paid.status).toBe("paid");
    expect(paid.paymentStatus).toBe("succeeded");
    expect(paid.paymentProvider).toBe("alipay");

    const accepted = await ordering.advanceFulfillment(placed.orderId, customer.id);
    expect(accepted.status).toBe("accepted");
    const making = await ordering.advanceFulfillment(placed.orderId, customer.id);
    expect(making.status).toBe("making");
    const ready = await ordering.advanceFulfillment(placed.orderId, customer.id);
    expect(ready.status).toBe("ready");
    const again = await ordering.advanceFulfillment(placed.orderId, customer.id);
    expect(again.status).toBe("ready");
  });

  it("updates an open cart line when the drink spec changes", async () => {
    const customer = await ordering.createGuest("configure");
    const cart = await ordering.addCartItem({
      customerId: customer.id,
      storeId: IDS.stores.luckinNanjing,
      skuId: IDS.skus.coconutLatteMedium,
      quantity: 1,
      modifierIds: [IDS.modifiers.sugarLess, IDS.modifiers.iceNone],
    });
    const updated = await ordering.configureCart({
      customerId: customer.id,
      cartId: cart.cartId,
      skuId: IDS.skus.coconutLatteLarge,
      modifierIds: [IDS.modifiers.sugarHalf, IDS.modifiers.iceLess],
    });
    expect(updated.lines[0]?.name).toContain("大杯");
    expect(updated.lines[0]?.unitPriceCents).toBe(2100);
    expect(updated.lines[0]?.modifiers).toEqual(["半糖", "少冰"]);
  });

  it("suggests size, store, and similar-item alternatives for a sold-out SKU", async () => {
    const suggested = await ordering.suggestAlternatives({
      storeId: IDS.stores.luckinNanjing,
      skuId: IDS.skus.soldOutLatte,
    });
    expect(suggested.alternatives.some((item) => item.kind === "sku")).toBe(true);
    expect(suggested.alternatives.some((item) => item.kind === "store")).toBe(true);
    expect(suggested.alternatives.some((item) => item.kind === "item")).toBe(true);
  });

  it("does not oversell a SKU with two cups under concurrent checkouts", async () => {
    await seedCatalog(db);
    const attempts = 20;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, async (_, index) => {
        const customer = await ordering.createGuest(`race-${index}`);
        const cart = await ordering.addCartItem({
          customerId: customer.id,
          storeId: IDS.stores.luckinNanjing,
          skuId: IDS.skus.limitedTwoLeft,
          quantity: 1,
          modifierIds: [],
        });
        return ordering.checkout({
          customerId: customer.id,
          cartId: cart.cartId,
          idempotencyKey: `race-${index}`,
          confirmed: true,
        });
      }),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const soldOut = results.filter(
      (result) => result.status === "rejected" && result.reason instanceof SoldOutError,
    );
    expect(fulfilled).toHaveLength(2);
    expect(soldOut.length).toBeGreaterThanOrEqual(18);

    const [stock] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.skuId, IDS.skus.limitedTwoLeft));
    expect(stock?.quantity).toBe(0);
  });

  it("rejects a sold-out SKU before checkout", async () => {
    const customer = await ordering.createGuest("soldout");
    await expect(
      ordering.addCartItem({
        customerId: customer.id,
        storeId: IDS.stores.luckinNanjing,
        skuId: IDS.skus.soldOutLatte,
        quantity: 1,
        modifierIds: [],
      }),
    ).rejects.toBeInstanceOf(SoldOutError);
  });
});
