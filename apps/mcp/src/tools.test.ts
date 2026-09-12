import { describe, expect, it } from "vitest";
import { assertKnownTool, listMcpTools } from "./tools.js";

describe("MCP tool catalog", () => {
  it("exposes the same ordering tools as the first-party agent", () => {
    const names = listMcpTools().map((tool) => tool.name);
    expect(names).toContain("search_stores");
    expect(names).toContain("checkout");
    expect(names).toContain("pay_order");
    assertKnownTool("get_menu");
    expect(() => assertKnownTool("rm_rf")).toThrow(/Unknown tool/);
  });
});
