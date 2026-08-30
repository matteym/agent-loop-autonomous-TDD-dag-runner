import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  bootstrapCommitSubject,
  commitBootstrap,
  parseGithubRemote,
  pushHead,
  setOriginRemote,
} from "./git.js";

describe("parseGithubRemote", () => {
  it("accepts https and ssh github urls", () => {
    expect(parseGithubRemote("https://github.com/acme/notes")).toBe(
      "https://github.com/acme/notes.git"
    );
    expect(parseGithubRemote("git@github.com:acme/notes.git")).toBe(
      "git@github.com:acme/notes.git"
    );
    expect(parseGithubRemote("https://gitlab.com/acme/notes.git")).toBeNull();
  });
});

describe("setOriginRemote", () => {
  it("adds origin and refuses a silent replace", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-remote-"));
    try {
      expect(spawnSync("git", ["init"], { cwd: dir }).status).toBe(0);
      const added = setOriginRemote(dir, "https://github.com/acme/notes", false);
      expect(added.ok).toBe(true);
      const clash = setOriginRemote(dir, "https://github.com/acme/other", false);
      expect(clash.ok).toBe(false);
      const replaced = setOriginRemote(dir, "https://github.com/acme/other", true);
      expect(replaced.ok).toBe(true);
      if (replaced.ok) {
        expect(replaced.url).toBe("https://github.com/acme/other.git");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pushHead", () => {
  it("returns git stderr when origin is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-push-"));
    try {
      expect(spawnSync("git", ["init"], { cwd: dir }).status).toBe(0);
      spawnSync("git", ["config", "user.name", "testrunner"], { cwd: dir });
      spawnSync("git", ["config", "user.email", "testrunner@example.com"], {
        cwd: dir,
      });
      writeFileSync(join(dir, "readme.txt"), "x\n");
      expect(spawnSync("git", ["add", "-A"], { cwd: dir }).status).toBe(0);
      expect(
        spawnSync("git", ["commit", "-m", "init"], { cwd: dir }).status
      ).toBe(0);
      const pushed = pushHead(dir);
      expect(pushed.ok).toBe(false);
      if (!pushed.ok) {
        expect(pushed.reason.length).toBeGreaterThan(0);
        expect(pushed.reason).not.toContain("--force");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("commitBootstrap", () => {
  it("refuses to invent a git author", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-boot-noid-"));
    try {
      const init = spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
      expect(init.status).toBe(0);
      expect(() => commitBootstrap(dir)).toThrow(/user\.name|nothing to commit/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("commits with a spaced subject as one git -m argument", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-boot-"));
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
      commitBootstrap(dir);
      const log = spawnSync("git", ["log", "-1", "--format=%s"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(log.status).toBe(0);
      expect((log.stdout || "").trim()).toBe(bootstrapCommitSubject);
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
