import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { pluginGitignoreLine, resolveProductLayout } from "./layout.js";

describe("resolveProductLayout", () => {
  it("uses the parent git work tree when the engine sits inside a product repo", () => {
    const parent = mkdtempSync(join(tmpdir(), "dag-layout-parent-"));
    try {
      expect(spawnSync("git", ["init"], { cwd: parent }).status).toBe(0);
      const engine = join(parent, "agent-loop-autonomous-TDD-dag-runner");
      mkdirSync(engine);
      const layout = resolveProductLayout(engine);
      expect(layout.nested).toBe(true);
      expect(layout.repoRoot).toBe(resolve(parent));
      expect(layout.pluginDirName).toBe("agent-loop-autonomous-TDD-dag-runner");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("stays on the engine when the parent is not a git repo", () => {
    const parent = mkdtempSync(join(tmpdir(), "dag-layout-loose-"));
    try {
      const engine = join(parent, "agent-loop-autonomous-TDD-dag-runner");
      mkdirSync(engine);
      const layout = resolveProductLayout(engine);
      expect(layout.nested).toBe(false);
      expect(layout.repoRoot).toBe(resolve(engine));
      expect(layout.pluginDirName).toBeNull();
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("pluginGitignoreLine", () => {
  it("ignores the plugin directory at the product root", () => {
    expect(pluginGitignoreLine("agent-loop-autonomous-TDD-dag-runner")).toBe(
      "agent-loop-autonomous-TDD-dag-runner/"
    );
  });
});
