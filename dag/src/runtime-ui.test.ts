import { describe, expect, it } from "vitest";
import {
  firstFailReason,
  formatGreenSummary,
  formatMcpCall,
  formatPause,
  formatPhaseBlock,
  formatRunHeader,
  formatTestResult,
  greenSummaryBullets,
  redactSecrets,
  summarizeAgentText,
} from "./runtime-ui.js";

describe("runtime-ui", () => {
  it("formats a run header with mcp none", () => {
    const lines = formatRunHeader({
      provider: "cursor",
      branch: "agent/demo",
      model: "composer-2.5",
      title: "notes api",
      mcpNames: [],
    });
    expect(lines.join("\n")).toContain("RUN provider=cursor");
    expect(lines.join("\n")).toContain("RUN mcp=none");
  });

  it("keeps phase labels distinct", () => {
    expect(formatPhaseBlock("GREEN", "node-1")).toBe("GREEN node-1");
    expect(formatPhaseBlock("PAUSE", "dirty tree")).toBe("PAUSE dirty tree");
    expect(formatPhaseBlock("TEST", "yarn test")).toBe("TEST yarn test");
  });

  it("separates TEST PASS and TEST FAIL", () => {
    expect(formatTestResult(true, "exit 0")).toBe("TEST PASS exit 0");
    expect(formatTestResult(false, "exit 1")).toBe("TEST FAIL exit 1");
    expect(firstFailReason("ok\nAssertionError: expected 1\n", 1)).toContain("AssertionError");
  });

  it("formats MCP CALL without payloads", () => {
    expect(formatMcpCall("playwright", "browser_click")).toBe("MCP CALL playwright/browser_click");
  });

  it("builds a GREEN SUMMARY of bullets", () => {
    const lines = formatGreenSummary(
      greenSummaryBullets({
        did: "added token rotation",
        files: ["src/auth.ts"],
        mcpUsed: false,
        nextPhase: "GUARD",
      })
    );
    expect(lines[0]).toBe("GREEN SUMMARY");
    expect(lines.some((line) => line.startsWith("- "))).toBe(true);
    expect(lines.join("\n")).toContain("files touched: src/auth.ts");
    expect(lines.join("\n")).toContain("MCP not used");
  });

  it("uses unknown instead of inventing files or agent text", () => {
    const bullets = greenSummaryBullets({
      did: "",
      files: [],
      mcpUsed: true,
      nextPhase: "GUARD",
    });
    expect(bullets[0]).toBe("agent: unknown");
    expect(bullets[1]).toBe("files touched: unknown");
    expect(summarizeAgentText("")).toBe("unknown");
  });

  it("formats PAUSE with the continue question and redacts secrets", () => {
    const lines = formatPause("missing CURSOR_API_KEY=sk-live-secret", "exit without starting");
    expect(lines.join("\n")).toContain("PAUSE");
    expect(lines.join("\n")).toContain("still continue ? o/n");
    expect(lines.join("\n")).not.toContain("sk-live-secret");
    expect(redactSecrets("Bearer abc.def")).toContain("Bearer ***");
  });
});
