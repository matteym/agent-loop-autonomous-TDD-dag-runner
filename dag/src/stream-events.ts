export type McpCall = {
  server: string;
  tool: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fromWireName(name: string): McpCall | null {
  const parts = name.split("__");
  if (parts.length >= 3 && parts[0] === "mcp") {
    return { server: parts[1], tool: parts.slice(2).join("__") };
  }
  return null;
}

function fromArgs(args: unknown): McpCall | null {
  if (!isRecord(args)) {
    return null;
  }
  const server =
    (typeof args.server === "string" && args.server) ||
    (typeof args.mcp_server === "string" && args.mcp_server) ||
    (typeof args.serverName === "string" && args.serverName) ||
    "";
  const tool =
    (typeof args.tool === "string" && args.tool) ||
    (typeof args.toolName === "string" && args.toolName) ||
    (typeof args.tool_name === "string" && args.tool_name) ||
    "";
  if (server && tool) {
    return { server, tool };
  }
  return null;
}

function callFromNameAndArgs(name: string, args: unknown): McpCall | null {
  const wired = fromWireName(name);
  if (wired) {
    return wired;
  }
  const lower = name.toLowerCase();
  if (lower.includes("mcp")) {
    const from = fromArgs(args);
    if (from) {
      return from;
    }
    return { server: "mcp", tool: name };
  }
  return null;
}

export function mcpCallsFromStreamEvent(event: unknown): McpCall[] {
  if (!isRecord(event)) {
    return [];
  }
  const out: McpCall[] = [];
  if (event.type === "tool_call" && typeof event.name === "string") {
    const call = callFromNameAndArgs(event.name, event.args);
    if (call) {
      out.push(call);
    }
  }
  if (event.type === "assistant" && isRecord(event.message) && Array.isArray(event.message.content)) {
    for (const block of event.message.content) {
      if (!isRecord(block) || block.type !== "tool_use" || typeof block.name !== "string") {
        continue;
      }
      const call = callFromNameAndArgs(block.name, block.input);
      if (call) {
        out.push(call);
      }
    }
  }
  if (typeof event.name === "string" && event.type === "user") {
    const call = callFromNameAndArgs(event.name, event);
    if (call) {
      out.push(call);
    }
  }
  return out;
}

export function uniqueMcpCalls(calls: McpCall[]): McpCall[] {
  const seen = new Set<string>();
  const out: McpCall[] = [];
  for (const call of calls) {
    const key = call.server + "/" + call.tool;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(call);
  }
  return out;
}
