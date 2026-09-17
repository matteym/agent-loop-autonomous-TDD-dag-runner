import { describe, expect, it } from "vitest";
import { mcpCallsFromStreamEvent, uniqueMcpCalls } from "./stream-events.js";

describe("mcpCallsFromStreamEvent", () => {
  it("reads mcp__server__tool tool_call events", () => {
    expect(
      mcpCallsFromStreamEvent({
        type: "tool_call",
        name: "mcp__playwright__browser_click",
        args: { selector: "button" },
      })
    ).toEqual([{ server: "playwright", tool: "browser_click" }]);
  });

  it("reads CallMcpTool args without logging payloads", () => {
    expect(
      mcpCallsFromStreamEvent({
        type: "tool_call",
        name: "CallMcpTool",
        args: { server: "playwright", toolName: "browser_click", secret: "nope" },
      })
    ).toEqual([{ server: "playwright", tool: "browser_click" }]);
  });

  it("reads assistant tool_use blocks", () => {
    expect(
      mcpCallsFromStreamEvent({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "mcp__docs__search", input: {} }],
        },
      })
    ).toEqual([{ server: "docs", tool: "search" }]);
  });

  it("ignores non-mcp tools", () => {
    expect(mcpCallsFromStreamEvent({ type: "tool_call", name: "Read", args: {} })).toEqual([]);
    expect(mcpCallsFromStreamEvent({ type: "thinking", text: "hmm" })).toEqual([]);
  });

  it("dedupes calls", () => {
    const call = { server: "playwright", tool: "click" };
    expect(uniqueMcpCalls([call, call])).toEqual([call]);
  });
});
