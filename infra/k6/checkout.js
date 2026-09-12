import http from "k6/http";
import { Counter } from "k6/metrics";

const placed = new Counter("orders_placed");
const soldOut = new Counter("orders_sold_out");

export const options = {
  vus: 20,
  iterations: 20,
};

const BASE = __ENV.API_URL || "http://127.0.0.1:3001";
const limitedSku = "44444444-4444-4444-8444-444444444499";
const storeId = "22222222-2222-4222-8222-222222222201";

export default function () {
  const guest = http.post(`${BASE}/v1/auth/guest`);
  const token = guest.json("token");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `k6-${__VU}-${__ITER}-${Date.now()}`,
  };
  const cart = http.post(
    `${BASE}/v1/carts`,
    JSON.stringify({ storeId, skuId: limitedSku, quantity: 1, modifierIds: [] }),
    { headers },
  );
  if (cart.status !== 200) {
    soldOut.add(1);
    return;
  }
  const checkout = http.post(
    `${BASE}/v1/checkout`,
    JSON.stringify({ cartId: cart.json("cartId") }),
    { headers },
  );
  if (checkout.status === 200) {
    placed.add(1);
  } else {
    soldOut.add(1);
  }
}

export function handleSummary(data) {
  const placedCount = data.metrics.orders_placed?.values?.count ?? 0;
  const soldOutCount = data.metrics.orders_sold_out?.values?.count ?? 0;
  const summary = { placedCount, soldOutCount };
  if (placedCount !== 2) {
    throw new Error(`expected 2 successful checkouts, got ${placedCount}`);
  }
  return { stdout: `${JSON.stringify(summary)}\n` };
}
