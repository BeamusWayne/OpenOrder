import { chromium } from "playwright";

const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  const notes = [];

  await page.goto(BASE);
  await page.waitForSelector("textarea:not([disabled])");
  notes.push("opened chat");

  await page.getByRole("button", { name: "发送" }).click();
  await page.getByTestId("store-list").waitFor();
  notes.push("saw store list");

  const nanjing = page.getByTestId("store-row").filter({ hasText: "南京西路" });
  await (await nanjing.count() ? nanjing.first() : page.getByTestId("store-row").first()).click();
  await page.getByTestId("modifier-picker").waitFor();
  notes.push("opened store and spec card");

  const large = page.getByTestId("sku-大");
  await large.waitFor({ timeout: 5000 });
  await large.click();
  notes.push("changed cup size");
  const half = page.getByTestId("mod-半糖");
  await half.waitFor({ timeout: 5000 });
  await half.click();
  notes.push("changed sugar");
  const plus = page.getByTestId("qty-plus");
  if (await plus.count()) {
    await plus.click();
    notes.push("changed cup count");
  }

  await page.getByTestId("order-confirm").waitFor();
  await page.getByTestId("confirm-order").click();
  await page.getByTestId("payment-sheet").waitFor();
  notes.push("confirmed into pending payment");

  const forbidden = await page.getByText("已经为你完成模拟支付").count();
  if (forbidden) {
    throw new Error("auto-pay completion copy is still visible");
  }

  await page.getByTestId("pay-wechat").click();
  await page.getByTestId("wechat-pay").waitFor();
  await page.getByTestId("cashier-cancel").click();
  await page.getByTestId("wechat-pay").waitFor({ state: "hidden" });
  await page.getByTestId("payment-sheet").waitFor();
  notes.push("cancelled WeChat cashier");

  await page.getByTestId("pay-alipay").click();
  await page.getByTestId("alipay-pay").waitFor();
  await page.getByTestId("cashier-confirm").click();
  await page.getByTestId("pay-receipt").waitFor();
  notes.push("Alipay paid");

  await page.getByTestId("progress-ready").waitFor({ timeout: 15000 });
  await page.getByTestId("pickup-code").waitFor();
  notes.push("saw fulfillment timeline and pickup code");

  await page.goto(`${BASE}/orders`);
  await page.getByTestId("order-card").first().waitFor();
  const orderText = await page.getByTestId("order-card").first().innerText();
  if (!/待取餐|制作中|已接单|已支付/.test(orderText)) {
    throw new Error(`orders page status mismatch: ${orderText}`);
  }
  notes.push("orders page matches paid order");

  await page.goto(BASE);
  await page.getByTestId("payment-sheet").waitFor();
  notes.push("refresh restored pending-or-paid conversation");

  await browser.close();
  console.log(notes.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
