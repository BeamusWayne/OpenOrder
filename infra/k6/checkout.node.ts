const BASE = process.env.API_URL ?? "http://127.0.0.1:3001";
const limitedSku = "44444444-4444-4444-8444-444444444499";
const storeId = "22222222-2222-4222-8222-222222222201";

async function oneAttempt(index: number) {
  const guest = await fetch(`${BASE}/v1/auth/guest`, { method: "POST" });
  const { token } = (await guest.json()) as { token: string };
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `node-k6-${index}-${Date.now()}`,
  };
  const cart = await fetch(`${BASE}/v1/carts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ storeId, skuId: limitedSku, quantity: 1, modifierIds: [] }),
  });
  if (!cart.ok) {
    return "sold_out";
  }
  const body = (await cart.json()) as { cartId: string };
  const checkout = await fetch(`${BASE}/v1/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify({ cartId: body.cartId }),
  });
  return checkout.ok ? "placed" : "sold_out";
}

const results = await Promise.all(Array.from({ length: 20 }, (_, index) => oneAttempt(index)));
const placed = results.filter((result) => result === "placed").length;
const soldOut = results.filter((result) => result === "sold_out").length;
console.log(JSON.stringify({ placed, soldOut }));
if (placed !== 2) {
  throw new Error(`expected 2 successful checkouts, got ${placed}`);
}
