import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  aheadBehind,
  bootstrapCommitSubject,
  commitBootstrap,
  isRejectedNonFastForward,
  parseGithubRemote,
  pushHead,
  pushHint,
  rebaseConflictPolicy,
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

function gitIdentity(cwd: string) {
  spawnSync("git", ["config", "user.name", "testrunner"], { cwd });
  spawnSync("git", ["config", "user.email", "testrunner@example.com"], { cwd });
  spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd });
  spawnSync("git", ["config", "core.autocrlf", "false"], { cwd });
}

function subjects(cwd: string): string[] {
  const log = spawnSync("git", ["log", "--format=%s"], {
    cwd,
    encoding: "utf8",
  });
  return (log.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("push rejection", () => {
  it("detects non-fast-forward and explains rebase, never force-push", () => {
    const reason =
      " ! [rejected]        HEAD -> agent/init (non-fast-forward)\n" +
      "error: failed to push some refs";
    expect(isRejectedNonFastForward(reason)).toBe(true);
    expect(pushHint(reason)).toContain("rebase");
    expect(pushHint(reason)).toContain(rebaseConflictPolicy);
    expect(pushHint(reason)).not.toMatch(/(?:^|[^-])--force(?:$|[^-])/);
    expect(isRejectedNonFastForward("gh: NotFound")).toBe(false);
    expect(pushHint("gh: NotFound")).toBe("gh: NotFound");
  });

  it(
    "rebases local commits onto origin then pushes (A-B-C + D => A-B-C-D')",
    () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-diverge-"));
    const bare = join(dir, "origin.git");
    const local = join(dir, "local");
    const other = join(dir, "other");
    try {
      mkdirSync(local);
      expect(spawnSync("git", ["init"], { cwd: local }).status).toBe(0);
      gitIdentity(local);
      spawnSync("git", ["checkout", "-B", "agent/init"], { cwd: local });
      writeFileSync(join(local, "base.txt"), "base\n");
      expect(spawnSync("git", ["add", "-A"], { cwd: local }).status).toBe(0);
      expect(
        spawnSync("git", ["commit", "-m", "base"], { cwd: local }).status
      ).toBe(0);
      expect(spawnSync("git", ["init", "--bare", bare], { cwd: dir }).status).toBe(
        0
      );
      expect(
        spawnSync("git", ["remote", "add", "origin", bare], { cwd: local }).status
      ).toBe(0);
      expect(
        spawnSync("git", ["push", "-u", "origin", "HEAD"], { cwd: local, encoding: "utf8" })
          .status
      ).toBe(0);
      expect(
        spawnSync("git", ["clone", "-b", "agent/init", bare, other], {
          cwd: dir,
          encoding: "utf8",
        }).status
      ).toBe(0);
      gitIdentity(other);
      writeFileSync(join(other, "remote.txt"), "remote leftover\n");
      expect(spawnSync("git", ["add", "-A"], { cwd: other }).status).toBe(0);
      expect(
        spawnSync("git", ["commit", "-m", "remote leftover"], { cwd: other })
          .status
      ).toBe(0);
      const otherPush = spawnSync("git", ["push", "origin", "HEAD"], {
        cwd: other,
        encoding: "utf8",
      });
      expect(otherPush.status, otherPush.stderr + otherPush.stdout).toBe(0);
      writeFileSync(join(local, "local.txt"), "new local\n");
      expect(spawnSync("git", ["add", "-A"], { cwd: local }).status).toBe(0);
      expect(
        spawnSync("git", ["commit", "-m", "new local"], { cwd: local }).status
      ).toBe(0);
      expect(spawnSync("git", ["fetch", "origin"], { cwd: local }).status).toBe(0);
      expect(aheadBehind(local)).toEqual({ ahead: 1, behind: 1 });
      const pushed = pushHead(local);
      expect(pushed.ok).toBe(true);
      const log = subjects(local);
      expect(log[0]).toBe("new local");
      expect(log).toContain("remote leftover");
      expect(log.indexOf("new local")).toBeLessThan(log.indexOf("remote leftover"));
      expect(existsSync(join(local, "remote.txt"))).toBe(true);
      expect(existsSync(join(local, "local.txt"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  20000
  );

  it("keeps remote history and replays the agent file on conflict", () => {
    const dir = mkdtempSync(join(tmpdir(), "dag-conflict-"));
    const bare = join(dir, "origin.git");
    const local = join(dir, "local");
    const other = join(dir, "other");
    try {
      mkdirSync(local);
      expect(spawnSync("git", ["init"], { cwd: local }).status).toBe(0);
      gitIdentity(local);
      spawnSync("git", ["checkout", "-B", "agent/init"], { cwd: local });
      writeFileSync(join(local, "shared.txt"), "base\n");
      expect(spawnSync("git", ["add", "-A"], { cwd: local }).status).toBe(0);
      expect(
        spawnSync("git", ["commit", "-m", "base"], { cwd: local }).status
      ).toBe(0);
      expect(spawnSync("git", ["init", "--bare", bare], { cwd: dir }).status).toBe(
        0
      );
      expect(
        spawnSync("git", ["remote", "add", "origin", bare], { cwd: local }).status
      ).toBe(0);
      expect(
        spawnSync("git", ["push", "-u", "origin", "HEAD"], { cwd: local, encoding: "utf8" })
          .status
      ).toBe(0);
      expect(
        spawnSync("git", ["clone", "-b", "agent/init", bare, other], {
          cwd: dir,
          encoding: "utf8",
        }).status
      ).toBe(0);
      gitIdentity(other);
      writeFileSync(join(other, "shared.txt"), "remote\n");
      expect(spawnSync("git", ["add", "-A"], { cwd: other }).status).toBe(0);
      expect(
        spawnSync("git", ["commit", "-m", "remote leftover"], { cwd: other })
          .status
      ).toBe(0);
      const otherPush = spawnSync("git", ["push", "origin", "HEAD"], {
        cwd: other,
        encoding: "utf8",
      });
      expect(otherPush.status, otherPush.stderr + otherPush.stdout).toBe(0);
      writeFileSync(join(local, "shared.txt"), "agent\n");
      expect(spawnSync("git", ["add", "-A"], { cwd: local }).status).toBe(0);
      expect(
        spawnSync("git", ["commit", "-m", "agent work"], { cwd: local }).status
      ).toBe(0);
      const pushed = pushHead(local);
      expect(pushed.ok).toBe(true);
      expect(readFileSync(join(local, "shared.txt"), "utf8").replace(/\r\n/g, "\n")).toBe(
        "agent\n"
      );
      const log = subjects(local);
      expect(log).toContain("remote leftover");
      expect(log).toContain("agent work");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
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
