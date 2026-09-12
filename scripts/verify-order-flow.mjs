import { chromium } from "playwright";

const BASE = process.env.WEB_URL ?? "http://127.0.0.1:3000";
const headed = process.env.HEADLESS === "0" || process.env.HEADED === "1";

async function launch() {
  const launchOptions = {
    headless: !headed,
    slowMo: headed ? 250 : 0,
  };
  try {
    return await chromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    return await chromium.launch(launchOptions);
  }
}

async function openChat(browser, notes) {
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (error) => notes.push(`pageerror: ${error.message}`));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("textarea").waitFor();
  await page.waitForFunction(() => {
    const box = document.querySelector("textarea");
    return Boolean(box && !box.disabled);
  });
  notes.push("opened chat");
  return page;
}

async function sendText(page, text) {
  const box = page.locator("textarea");
  await box.fill(text);
  await page.waitForFunction(() => {
    const send = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "发送");
    return Boolean(send && !send.disabled);
  });
  await page.getByRole("button", { name: "发送" }).click();
}

async function pickNanjing(page) {
  const nanjing = page.getByTestId("store-row").filter({ hasText: "南京西路" });
  await (await nanjing.count() ? nanjing.first() : page.getByTestId("store-row").first()).click();
}

async function waitIdle(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector("form.composer button[type='submit']");
    const status = document.querySelector(".status-row");
    return Boolean(button) && !status;
  });
}

async function happyPath(browser, notes) {
  const page = await openChat(browser, notes);
  await sendText(page, "帮我点杯瑞幸生椰拿铁少糖");
  await page.getByTestId("store-list").waitFor();
  notes.push("happy: store list");

  await pickNanjing(page);
  await page.getByTestId("modifier-picker").waitFor();
  notes.push("happy: spec card");

  await page.getByTestId("sku-大").click();
  await page.getByTestId("mod-半糖").click();
  if (await page.getByTestId("qty-plus").count()) {
    await page.getByTestId("qty-plus").click();
  }

  await page.getByTestId("order-confirm").waitFor();
  await page.getByTestId("confirm-order").click();
  await page.getByTestId("payment-sheet").waitFor();
  notes.push("happy: pending payment");

  if (await page.getByText("已经为你完成模拟支付").count()) {
    throw new Error("auto-pay completion copy is still visible");
  }

  await page.getByTestId("pay-wechat").click();
  await page.getByTestId("wechat-pay").waitFor();
  await page.getByTestId("cashier-cancel").click();
  await page.getByTestId("wechat-pay").waitFor({ state: "hidden" });
  await page.getByTestId("payment-sheet").waitFor();
  notes.push("happy: cancelled WeChat");

  await page.getByTestId("pay-alipay").click();
  await page.getByTestId("alipay-pay").waitFor();
  await page.getByTestId("cashier-confirm").click();
  await page.getByTestId("pay-receipt").waitFor();
  await page.getByTestId("progress-ready").waitFor({ timeout: 15000 });
  await page.getByTestId("pickup-code").waitFor();
  notes.push("happy: Alipay paid with pickup code");

  await page.getByRole("link", { name: "查看订单" }).click();
  await page.getByTestId("order-card").first().waitFor();
  const orderText = await page.getByTestId("order-card").first().innerText();
  if (!/待取餐|制作中|已接单|已支付/.test(orderText)) {
    throw new Error(`orders page status mismatch: ${orderText}`);
  }
  notes.push("happy: orders page");

  await page.getByTestId("order-again").click();
  await page.waitForURL(/\/$/);
  await page.locator("textarea:not([disabled])").waitFor();
  await page.getByTestId("store-list").waitFor({ timeout: 40000 });
  notes.push("reorder: new turn after 再来一单");
  await page.close();
}

async function clarifyPath(browser, notes) {
  const page = await openChat(browser, notes);
  await sendText(page, "我想点奶茶");
  await page.getByTestId("clarify").waitFor();
  notes.push("clarify: card shown");
  await page.getByTestId("clarify-one-less").click();
  await page.getByTestId("store-list").waitFor();
  notes.push("clarify: picked 一杯少糖去冰 and got stores");
  await page.close();
}

async function soldOutPath(browser, notes) {
  const page = await openChat(browser, notes);
  await sendText(page, "帮我点杯瑞幸生椰拿铁超大杯");
  await page.getByTestId("store-list").waitFor();
  await pickNanjing(page);
  await page.getByTestId("sold-out").waitFor();
  notes.push("sold-out: card shown");
  const altSku = page.getByTestId("alt-sku").first();
  await altSku.waitFor();
  await altSku.click();
  await Promise.race([
    page.getByTestId("modifier-picker").waitFor(),
    page.getByTestId("order-confirm").waitFor(),
  ]);
  notes.push("sold-out: picked cup-size alternative");
  await page.close();
}

async function changeStoreAndAddCup(browser, notes) {
  const page = await openChat(browser, notes);
  await sendText(page, "帮我点杯瑞幸生椰拿铁少糖");
  await page.getByTestId("store-list").waitFor();
  await pickNanjing(page);
  await page.getByTestId("modifier-picker").waitFor();
  await waitIdle(page);

  await sendText(page, "换店");
  await page.getByTestId("store-list").last().waitFor();
  notes.push("change-store: list shown again");
  const xintiandi = page.getByTestId("store-row").filter({ hasText: "新天地" });
  await (await xintiandi.count() ? xintiandi.last() : page.getByTestId("store-row").last()).click();
  await page.getByTestId("modifier-picker").last().waitFor();
  notes.push("change-store: selected 新天地");
  await waitIdle(page);

  await sendText(page, "再加一杯");
  await page.getByTestId("order-confirm").last().waitFor();
  notes.push("add-cup: confirm card after 再加一杯");
  await page.close();
}

async function main() {
  const browser = await launch();
  const notes = [];
  try {
    await happyPath(browser, notes);
    await clarifyPath(browser, notes);
    await soldOutPath(browser, notes);
    await changeStoreAndAddCup(browser, notes);
    console.log(notes.join("\n"));
  } catch (error) {
    console.error(notes.join("\n"));
    throw error;
  } finally {
    if (headed) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
