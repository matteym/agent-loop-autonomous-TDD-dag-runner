import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { commitRails, missingGitIdentityHint, railsCommitSubject } from "./git.js";

describe("commitRails", () => {
  it("refuses to invent a git author", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-rails-noid-"));
    try {
      const init = spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
      expect(init.status).toBe(0);
      expect(() => commitRails(dir)).toThrow(missingGitIdentityHint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("commits with a spaced subject as one git -m argument", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-rails-"));
    try {
      const init = spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
      expect(init.status).toBe(0);
      spawnSync("git", ["config", "user.name", "testrunner"], { cwd: dir });
      spawnSync("git", ["config", "user.email", "testrunner@example.com"], { cwd: dir });
      spawnSync("git", ["checkout", "-B", "agent/init"], {
        cwd: dir,
        encoding: "utf8",
      });
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "health.ts"), "export {}\n");
      writeFileSync(join(dir, ".env"), "APP_PORT=3000\n");
      commitRails(dir);
      const log = spawnSync("git", ["log", "-1", "--format=%s"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(log.status).toBe(0);
      expect((log.stdout || "").trim()).toBe(railsCommitSubject);
      const show = spawnSync("git", ["ls-files", ".env"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect((show.stdout || "").trim()).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
