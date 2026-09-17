import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { copyEngineCursor, writeBootstrap } from "./bootstrap.js";
import { pluginGitignoreLine } from "../layout.js";

describe("writeBootstrap", () => {
  it("adds the nested plugin folder to the product gitignore", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-boot-ignore-"));
    try {
      const line = pluginGitignoreLine("agent-loop-autonomous-TDD-dag-runner");
      writeBootstrap(dir, [line]);
      const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
      expect(gitignore).toContain(line);
      expect(gitignore).toContain(".env");
      expect(gitignore).toContain("dag/logs/status");
      expect(gitignore).toContain("dag/logs/next-run.sh");
      expect(existsSync(join(dir, "src", ".gitkeep"))).toBe(true);
      expect(existsSync(join(dir, "src", "backend"))).toBe(false);
      expect(existsSync(join(dir, "src", "frontend"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("copyEngineCursor", () => {
  it("copies .cursor from the plugin into the product root", () => {
    const product = mkdtempSync(join(tmpdir(), "dag-cursor-product-"));
    const engine = mkdtempSync(join(tmpdir(), "dag-cursor-engine-"));
    try {
      mkdirSync(join(engine, ".cursor", "skills", "agent-loop"), { recursive: true });
      writeFileSync(join(engine, ".cursor", "skills", "agent-loop", "SKILL.md"), "# skill\n");
      copyEngineCursor(engine, product);
      expect(
        readFileSync(join(product, ".cursor", "skills", "agent-loop", "SKILL.md"), "utf8")
      ).toBe("# skill\n");
    } finally {
      rmSync(product, { recursive: true, force: true });
      rmSync(engine, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing product .cursor/mcp.json", () => {
    const product = mkdtempSync(join(tmpdir(), "dag-cursor-mcp-product-"));
    const engine = mkdtempSync(join(tmpdir(), "dag-cursor-mcp-engine-"));
    try {
      mkdirSync(join(engine, ".cursor", "skills", "agent-loop"), { recursive: true });
      writeFileSync(join(engine, ".cursor", "skills", "agent-loop", "SKILL.md"), "# skill\n");
      writeFileSync(join(engine, ".cursor", "mcp.json"), '{"mcpServers":{"engine":{"command":"x"}}}\n');
      mkdirSync(join(product, ".cursor"), { recursive: true });
      writeFileSync(
        join(product, ".cursor", "mcp.json"),
        '{"mcpServers":{"playwright":{"command":"npx"}}}\n'
      );
      copyEngineCursor(engine, product);
      expect(readFileSync(join(product, ".cursor", "mcp.json"), "utf8")).toContain("playwright");
      expect(
        readFileSync(join(product, ".cursor", "skills", "agent-loop", "SKILL.md"), "utf8")
      ).toBe("# skill\n");
    } finally {
      rmSync(product, { recursive: true, force: true });
      rmSync(engine, { recursive: true, force: true });
    }
  });

  it("is a no-op when engine and product are the same directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-cursor-same-"));
    try {
      copyEngineCursor(dir, dir);
      expect(existsSync(join(dir, ".cursor"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
