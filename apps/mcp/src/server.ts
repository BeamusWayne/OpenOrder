import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDb } from "@openorder/db";
import { Ordering } from "@openorder/domain";
import { createToolRouter } from "@openorder/tools";
import { z } from "zod";
import { listMcpTools } from "./tools.js";

const db = createDb(process.env.DATABASE_URL ?? "postgres://openorder:openorder@127.0.0.1:5433/openorder");
const ordering = new Ordering(db);
const customerId = process.env.OPENORDER_CUSTOMER_ID;
if (!customerId) {
  throw new Error("OPENORDER_CUSTOMER_ID is required for the MCP adapter");
}
const executeTool = createToolRouter(ordering, {
  customerId,
  threadId: process.env.OPENORDER_THREAD_ID ?? "00000000-0000-4000-8000-000000000099",
  confirmed: process.env.OPENORDER_CONFIRMED === "1",
});

const server = new McpServer({ name: "openorder", version: "0.0.1" });

for (const tool of listMcpTools()) {
  server.tool(tool.name, tool.description ?? tool.name, { raw: z.string().optional() }, async (input) => {
    const result = await executeTool(tool.name, input.raw ? JSON.parse(input.raw) : input);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
