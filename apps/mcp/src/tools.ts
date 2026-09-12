import { OPENAI_TOOLS, TOOL_NAMES } from "@openorder/protocol";

export function listMcpTools() {
  return OPENAI_TOOLS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    inputSchema: tool.function.parameters,
  }));
}

export function assertKnownTool(name: string) {
  if (!TOOL_NAMES.includes(name as (typeof TOOL_NAMES)[number])) {
    throw new Error(`Unknown tool ${name}`);
  }
}
