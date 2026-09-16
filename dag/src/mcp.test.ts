import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expandEnvRefs,
  loadProjectMcp,
  mcpBriefingLines,
  mcpToolAllowlist,
  toClaudeMcpServers,
  toCursorMcpServers,
} from "./mcp.js";

function writeMcp(root: string, body: unknown) {
  mkdirSync(join(root, ".cursor"), { recursive: true });
  writeFileSync(join(root, ".cursor", "mcp.json"), JSON.stringify(body));
}

describe("loadProjectMcp", () => {
  it("loads stdio and http servers from .cursor/mcp.json", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-mcp-"));
    try {
      writeMcp(root, {
        mcpServers: {
          playwright: {
            command: "npx",
            args: ["-y", "@playwright/mcp@latest"],
          },
          docs: {
            type: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer ${TOKEN}" },
          },
        },
      });
      const loaded = loadProjectMcp(root, root, { TOKEN: "secret-token" });
      expect(loaded.names).toEqual(["docs", "playwright"]);
      expect(loaded.servers.playwright).toEqual({
        transport: "stdio",
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
      });
      expect(loaded.servers.docs).toEqual({
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer secret-token" },
      });
      const briefing = mcpBriefingLines(loaded).join("\n");
      expect(briefing).toContain("playwright");
      expect(briefing).not.toContain("secret-token");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lets the product .cursor/mcp.json win over the engine copy", () => {
    const product = mkdtempSync(join(tmpdir(), "dag-mcp-prod-"));
    const engine = mkdtempSync(join(tmpdir(), "dag-mcp-eng-"));
    try {
      writeMcp(engine, { mcpServers: { playwright: { command: "engine-bin" } } });
      writeMcp(product, { mcpServers: { playwright: { command: "product-bin" } } });
      const loaded = loadProjectMcp(product, engine);
      expect(loaded.servers.playwright).toMatchObject({ command: "product-bin" });
    } finally {
      rmSync(product, { recursive: true, force: true });
      rmSync(engine, { recursive: true, force: true });
    }
  });

  it("skips disabled and invalid servers", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-mcp-skip-"));
    try {
      writeMcp(root, {
        mcpServers: {
          dead: { disabled: true, command: "npx" },
          bad: { foo: 1 },
          "not valid": { command: "npx" },
          ok: { command: "npx", args: ["-y", "pkg"] },
        },
      });
      expect(loadProjectMcp(root).names).toEqual(["ok"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps servers for Cursor and Claude without dropping the command", () => {
    const root = mkdtempSync(join(tmpdir(), "dag-mcp-map-"));
    try {
      writeMcp(root, { mcpServers: { playwright: { command: "npx", args: ["-y", "x"] } } });
      const loaded = loadProjectMcp(root);
      expect(toCursorMcpServers(loaded.servers).playwright).toMatchObject({
        type: "stdio",
        command: "npx",
      });
      expect(toClaudeMcpServers(loaded.servers).playwright).toMatchObject({
        command: "npx",
      });
      expect(mcpToolAllowlist(loaded.names)).toEqual([
        "mcp__playwright",
        "mcp__playwright__*",
        "mcp__*",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("expandEnvRefs", () => {
  it("expands ${NAME} and ${env:NAME}", () => {
    const env = { FOO: "bar", BAZ: "qux" };
    expect(expandEnvRefs("x-${FOO}-${env:BAZ}", env)).toBe("x-bar-qux");
  });
});
