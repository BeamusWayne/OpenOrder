import { completeChat } from "@openorder/llm-mock";
import { LlmClient } from "@openorder/llm";
import { describe, expect, it, vi } from "vitest";
import { runTurn } from "./host.js";

function stubClient() {
  return {
    complete: async (request: never) => completeChat({ ...(request as object), model: "openorder-mock" }),
  } as unknown as LlmClient;
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
    expect(events.some((event) => event.type === "token" && event.text?.includes("选择一家门店"))).toBe(true);
  });
});
