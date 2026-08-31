import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  parkNestedEngineGit,
  parkedGitDirName,
  pluginGitignoreLine,
  resolveProductLayout,
} from "./layout.js";

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

describe("parkNestedEngineGit", () => {
  it("parks the nested engine .git so git from dag/ is the product repo", () => {
    const parent = mkdtempSync(join(tmpdir(), "dag-park-parent-"));
    try {
      expect(spawnSync("git", ["init"], { cwd: parent }).status).toBe(0);
      const engine = join(parent, "agent-loop-autonomous-TDD-dag-runner");
      const dag = join(engine, "dag");
      mkdirSync(dag, { recursive: true });
      expect(spawnSync("git", ["init"], { cwd: engine }).status).toBe(0);
      const before = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: dag,
        encoding: "utf8",
      });
      expect(resolve((before.stdout || "").trim())).toBe(resolve(engine));
      const parked = parkNestedEngineGit(engine, true);
      expect(parked).toBe(join(engine, parkedGitDirName));
      expect(existsSync(join(engine, ".git"))).toBe(false);
      const after = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: dag,
        encoding: "utf8",
      });
      expect(resolve((after.stdout || "").trim())).toBe(resolve(parent));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("does not touch .git when the engine is not nested", () => {
    const engine = mkdtempSync(join(tmpdir(), "dag-park-solo-"));
    try {
      expect(spawnSync("git", ["init"], { cwd: engine }).status).toBe(0);
      expect(parkNestedEngineGit(engine, false)).toBeNull();
      expect(existsSync(join(engine, ".git"))).toBe(true);
      expect(existsSync(join(engine, parkedGitDirName))).toBe(false);
    } finally {
      rmSync(engine, { recursive: true, force: true });
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
