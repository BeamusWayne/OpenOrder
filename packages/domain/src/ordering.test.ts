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
