import { completeChat, streamChat } from "@openorder/llm-mock";
import { LlmClient } from "@openorder/llm";
import { describe, expect, it, vi } from "vitest";
import { runTurn } from "./host.js";

function stubClient() {
  return {
    complete: async (request: never) => completeChat({ ...(request as object), model: "openorder-mock" }),
    stream: async function* (request: never) {
      const chunks = streamChat({ ...(request as object), model: "openorder-mock", stream: true });
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as unknown as LlmClient;
}

function spoken(events: Array<{ type: string; text?: string }>) {
  return events
    .filter((event) => event.type === "token")
    .map((event) => event.text ?? "")
    .join("");
}

describe("agent host", () => {
  it("intercepts out-of-scope Transformer questions without tools", async () => {
    const executeTool = vi.fn();
    const events = [];
    for await (const event of runTurn("解释一下Transformer框架的原理", {
      llm: stubClient(),
      executeTool,
    })) {
      events.push(event);
    }
    expect(executeTool).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "intent" && event.intent === "out_of_scope")).toBe(true);
    const intercept = events.find((event) => event.type === "ui" && event.block.type === "intercept");
    expect(intercept).toBeDefined();
    expect(intercept && intercept.type === "ui" ? intercept.block.message : "").toBe(
      "我只能帮你点饮品、改规格、确认下单或查询已有订单。",
    );
    expect(spoken(events)).toContain("我只能帮你点饮品");
    expect(JSON.stringify(events)).not.toMatch(/Transformer|算法|原理这类/);
  });

  it("starts the ordering tool loop for a Luckin request", async () => {
    const executeTool = vi.fn(async (name: string) => {
      if (name === "search_stores") {
        return [
          {
            id: "22222222-2222-4222-8222-222222222201",
            brand: "瑞幸咖啡",
            name: "瑞幸咖啡 南京西路店",
            distanceMeters: 400,
            rating: 4.8,
            etaMinutes: 15,
          },
        ];
      }
      return {};
    });
    const events = [];
    for await (const event of runTurn("帮我点杯瑞幸生椰拿铁少糖", {
      llm: stubClient(),
      executeTool,
    })) {
      events.push(event);
    }
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls[0]?.[0]).toBe("search_stores");
    expect(events.some((event) => event.type === "ui" && event.block.type === "store_list")).toBe(true);
    expect(spoken(events)).toContain("选择一家门店");
    expect(events.filter((event) => event.type === "token").length).toBeGreaterThan(1);
  });

  it("stops after checkout on a payment sheet without paying", async () => {
    const executeTool = vi.fn(async (name: string) => {
      if (name === "checkout") {
        return {
          orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          status: "draft_confirmed",
          storeName: "瑞幸咖啡 南京西路店",
          merchantName: "瑞幸咖啡",
          totalCents: 1800,
          paymentStatus: "pending",
          lines: [{ name: "生椰拿铁 中杯", quantity: 1, unitPriceCents: 1800, modifiers: ["少糖"] }],
        };
      }
      return {};
    });
    const events = [];
    for await (const event of runTurn("确认下单 cartId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", {
      llm: stubClient(),
      executeTool,
      history: [
        { role: "user", content: "帮我点杯瑞幸生椰拿铁少糖" },
        { role: "tool", name: "search_stores", content: "[]" },
        { role: "tool", name: "get_menu", content: "{}" },
        { role: "tool", name: "add_cart_item", content: "{}" },
        { role: "tool", name: "prepare_checkout", content: "{}" },
      ],
    })) {
      events.push(event);
    }
    expect(executeTool.mock.calls.map((call) => call[0])).toEqual(["checkout"]);
    expect(events.some((event) => event.type === "ui" && event.block.type === "payment_sheet")).toBe(true);
    expect(spoken(events)).toContain("还没有付款");
    expect(spoken(events)).not.toContain("已经为你完成模拟支付");
  });
});
